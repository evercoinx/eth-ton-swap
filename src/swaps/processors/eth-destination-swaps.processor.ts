import { InjectQueue, OnQueueCompleted, Process, Processor } from "@nestjs/bull"
import { CACHE_MANAGER, Inject, Logger } from "@nestjs/common"
import BigNumber from "bignumber.js"
import { Job, Queue } from "bull"
import { Cache } from "cache-manager"
import { ATTEMPT_COUNT_ULTIMATE, QUEUE_LOW_PRIORITY } from "src/common/constants"
import { EventsService } from "src/common/events.service"
import { EthereumBlockchainProvider } from "src/ethereum/ethereum-blockchain.provider"
import { EthereumConractProvider } from "src/ethereum/ethereum-contract.provider"
import { TON_BLOCK_TRACKING_INTERVAL } from "src/ton/constants"
import {
	ETH_DESTINATION_SWAPS_QUEUE,
	ETH_TOTAL_SWAP_CONFIRMATIONS,
	TON_SOURCE_SWAPS_QUEUE,
	TON_TOTAL_SWAP_CONFIRMATIONS,
	TRANSFER_ETH_TOKENS_JOB,
	TRANSFER_TON_FEE_JOB,
} from "../constants"
import { TransferFeeDto } from "../dto/transfer-fee.dto"
import { TransferTokensDto } from "../dto/transfer-tokens.dto"
import { getNonProcessableSwapStatuses, SwapStatus } from "../enums/swap-status.enum"
import { SwapEvent } from "../interfaces/swap-event.interface"
import { SwapsService } from "../swaps.service"
import { EthBaseSwapsProcessor } from "./eth-base-swaps.processor"

@Processor(ETH_DESTINATION_SWAPS_QUEUE)
export class EthDestinationSwapsProcessor extends EthBaseSwapsProcessor {
	private readonly logger = new Logger(EthDestinationSwapsProcessor.name)

	constructor(
		@Inject(CACHE_MANAGER) cacheManager: Cache,
		protected readonly ethereumBlockchain: EthereumBlockchainProvider,
		private readonly ethereumContract: EthereumConractProvider,
		private readonly eventsService: EventsService,
		private readonly swapsService: SwapsService,
		@InjectQueue(TON_SOURCE_SWAPS_QUEUE) private readonly sourceSwapsQueue: Queue,
	) {
		super(cacheManager, "eth:dst", ethereumBlockchain)
	}

	@Process(TRANSFER_ETH_TOKENS_JOB)
	async transferEthTokens(job: Job<TransferTokensDto>): Promise<SwapStatus> {
		const { data } = job
		this.logger.debug(`${data.swapId}: Start transferring tokens`)

		const swap = await this.swapsService.findById(data.swapId)
		if (!swap) {
			this.logger.error(`${data.swapId}: Swap not found`)
			return SwapStatus.Failed
		}

		if (swap.extendedExpiresAt < new Date()) {
			await this.swapsService.update(swap.id, { status: SwapStatus.Expired })

			this.logger.error(`${swap.id}: Swap expired`)
			return SwapStatus.Expired
		}

		const gasPrice = await this.getGasPrice()

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

		await this.ethereumBlockchain.waitForTransaction(
			transactionId,
			ETH_TOTAL_SWAP_CONFIRMATIONS,
		)

		await this.swapsService.update(swap.id, {
			destinationTransactionId: transactionId,
			status: SwapStatus.Completed,
		})

		return SwapStatus.Completed
	}

	@OnQueueCompleted({ name: TRANSFER_ETH_TOKENS_JOB })
	async onTransferEthTokensCompleted(
		job: Job<TransferTokensDto>,
		result: SwapStatus,
	): Promise<void> {
		const { data } = job
		if (getNonProcessableSwapStatuses().includes(result)) {
			this.eventsService.emit({
				id: data.swapId,
				status: result,
				currentConfirmations: TON_TOTAL_SWAP_CONFIRMATIONS,
				totalConfirmations: TON_TOTAL_SWAP_CONFIRMATIONS,
				createdAt: Date.now(),
			} as SwapEvent)
			return
		}

		this.eventsService.emit({
			id: data.swapId,
			status: SwapStatus.Completed,
			currentConfirmations: TON_TOTAL_SWAP_CONFIRMATIONS,
			totalConfirmations: TON_TOTAL_SWAP_CONFIRMATIONS,
			createdAt: Date.now(),
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
