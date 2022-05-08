import { InjectQueue, OnQueueCompleted, Process, Processor } from "@nestjs/bull"
import { Logger } from "@nestjs/common"
import BigNumber from "bignumber.js"
import { Job, Queue } from "bull"
import { ATTEMPT_COUNT_ULTIMATE, QUEUE_LOW_PRIORITY } from "src/common/constants"
import { EventsService } from "src/common/events.service"
import { EthereumBlockchainService } from "src/ethereum/providers/ethereum-blockchain.service"
import { EthereumConractService } from "src/ethereum/providers/ethereum-contract.service"
import { TON_BLOCK_TRACKING_INTERVAL } from "src/ton/constants"
import {
	ETH_DESTINATION_SWAPS_QUEUE,
	ETH_TOTAL_CONFIRMATIONS,
	TON_SOURCE_SWAPS_QUEUE,
	TON_TOTAL_CONFIRMATIONS,
	TRANSFER_ETH_TOKENS_JOB,
	TRANSFER_TON_FEE_JOB,
} from "../constants"
import { TransferFeeDto } from "../dto/transfer-fee.dto"
import { TransferTokensDto } from "../dto/transfer-tokens.dto"
import { getNonProcessableSwapStatuses, SwapStatus } from "../enums/swap-status.enum"
import { SwapEvent } from "../interfaces/swap-event.interface"
import { SwapResult } from "../interfaces/swap-result.interface"
import { EthereumCacheHelper } from "../providers/ethereum-cache.helper"
import { SwapsHelper } from "../providers/swaps.helper"
import { SwapsService } from "../providers/swaps.service"

@Processor(ETH_DESTINATION_SWAPS_QUEUE)
export class EthDestinationSwapsProcessor {
	private readonly logger = new Logger(EthDestinationSwapsProcessor.name)

	constructor(
		@InjectQueue(TON_SOURCE_SWAPS_QUEUE) private readonly sourceSwapsQueue: Queue,
		private readonly ethereumBlockchain: EthereumBlockchainService,
		private readonly ethereumContract: EthereumConractService,
		private readonly ethereumCacheHelper: EthereumCacheHelper,
		private readonly eventsService: EventsService,
		private readonly swapsHelper: SwapsHelper,
		private readonly swapsService: SwapsService,
	) {}

	@Process(TRANSFER_ETH_TOKENS_JOB)
	async transferEthTokens(job: Job<TransferTokensDto>): Promise<SwapResult> {
		const { data } = job
		this.logger.debug(`${data.swapId}: Start transferring tokens`)

		const swap = await this.swapsService.findById(data.swapId)
		if (!swap) {
			return this.swapsHelper.swapNotFound(data.swapId, this.logger)
		}

		if (swap.extendedExpiresAt < new Date()) {
			return await this.swapsHelper.swapExpired(swap, this.logger)
		}

		const gasPrice = await this.ethereumCacheHelper.getGasPrice()

		const tokenContract = this.ethereumContract.createTokenContract(
			swap.destinationToken.address,
			swap.destinationWallet.secretKey,
		)
		const transactionId = await this.ethereumContract.transferTokens(
			tokenContract,
			swap.destinationAddress,
			new BigNumber(swap.destinationAmount),
			swap.destinationToken.decimals,
			gasPrice,
		)

		await this.ethereumBlockchain.waitForTransaction(transactionId, ETH_TOTAL_CONFIRMATIONS)

		const result = this.swapsHelper.toSwapResult(SwapStatus.Completed)
		await this.swapsService.update(swap.id, {
			destinationTransactionId: transactionId,
			status: result.status,
			statusCode: result.statusCode,
		})

		return result
	}

	@OnQueueCompleted({ name: TRANSFER_ETH_TOKENS_JOB })
	async onTransferEthTokensCompleted(
		job: Job<TransferTokensDto>,
		result: SwapResult,
	): Promise<void> {
		const { data } = job
		const { status, statusCode } = result

		if (getNonProcessableSwapStatuses().includes(result.status)) {
			this.eventsService.emit({
				status,
				statusCode,
				currentConfirmations: TON_TOTAL_CONFIRMATIONS,
				totalConfirmations: TON_TOTAL_CONFIRMATIONS,
			} as SwapEvent)
			return
		}

		this.eventsService.emit({
			status,
			statusCode,
			currentConfirmations: TON_TOTAL_CONFIRMATIONS,
			totalConfirmations: TON_TOTAL_CONFIRMATIONS,
		} as SwapEvent)
		this.logger.log(`${data.swapId}: Tokens transferred`)

		await this.sourceSwapsQueue.add(
			TRANSFER_TON_FEE_JOB,
			{ swapId: data.swapId } as TransferFeeDto,
			{
				attempts: ATTEMPT_COUNT_ULTIMATE,
				priority: QUEUE_LOW_PRIORITY,
				backoff: {
					type: "exponential",
					delay: TON_BLOCK_TRACKING_INTERVAL,
				},
			},
		)
	}
}
