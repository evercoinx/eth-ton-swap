import { InjectQueue, OnQueueCompleted, OnQueueFailed, Process, Processor } from "@nestjs/bull"
import { CACHE_MANAGER, Inject, Logger } from "@nestjs/common"
import BigNumber from "bignumber.js"
import { Job, Queue } from "bull"
import { Cache } from "cache-manager"
import { EventsService } from "src/common/events.service"
import { EthereumBlockchainProvider } from "src/ethereum/ethereum-blockchain.provider"
import { EthereumConractProvider } from "src/ethereum/ethereum-contract.provider"
import { WalletsService } from "src/wallets/wallets.service"
import {
	ETH_BLOCK_TRACKING_INTERVAL,
	ETH_DESTINATION_SWAPS_QUEUE,
	QUEUE_HIGH_PRIORITY,
	QUEUE_LOW_PRIORITY,
	TON_SOURCE_SWAPS_QUEUE,
	TOTAL_CONFIRMATIONS,
	TRANSFER_ETH_SWAP_JOB,
	TRANSFER_TON_FEE_JOB,
} from "../constants"
import { TransferFeeDto } from "../dto/transfer-fee.dto"
import { TransferSwapDto } from "../dto/transfer-swap.dto"
import { EthBaseSwapsProcessor } from "./eth-base-swaps.processor"
import { SwapStatus } from "../swap.entity"
import { SwapsService } from "../swaps.service"

@Processor(ETH_DESTINATION_SWAPS_QUEUE)
export class EthDestinationSwapsProcessor extends EthBaseSwapsProcessor {
	private readonly logger = new Logger(EthDestinationSwapsProcessor.name)

	constructor(
		@Inject(CACHE_MANAGER) cacheManager: Cache,
		protected readonly ethereumBlockchain: EthereumBlockchainProvider,
		protected readonly ethereumContract: EthereumConractProvider,
		protected readonly swapsService: SwapsService,
		protected readonly eventsService: EventsService,
		protected readonly walletsService: WalletsService,
		@InjectQueue(ETH_DESTINATION_SWAPS_QUEUE) private readonly destinationSwapsQueue: Queue,
		@InjectQueue(TON_SOURCE_SWAPS_QUEUE) private readonly sourceSwapsQueue: Queue,
	) {
		super(
			cacheManager,
			"eth:dst",
			ethereumBlockchain,
			swapsService,
			eventsService,
			walletsService,
		)
	}

	@Process(TRANSFER_ETH_SWAP_JOB)
	async transferEthSwap(job: Job<TransferSwapDto>): Promise<SwapStatus> {
		const { data } = job
		this.logger.debug(`${data.swapId}: Start transferring swap`)

		const swap = await this.swapsService.findById(data.swapId)
		if (!swap) {
			this.logger.error(`${data.swapId}: Swap not found`)
			return SwapStatus.Failed
		}

		if (swap.expiresAt < new Date()) {
			await this.swapsService.update(
				swap.id,
				{ status: SwapStatus.Expired },
				swap.sourceToken,
				swap.destinationToken,
			)

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
		if (!transactionId) {
			await this.swapsService.update(
				swap.id,
				{ status: SwapStatus.Failed },
				swap.sourceToken,
				swap.destinationToken,
			)

			this.logger.error(`${swap.id}: Transaction id not detected during token transfer`)
			return SwapStatus.Failed
		}

		await this.swapsService.update(
			swap.id,
			{
				destinationTransactionId: transactionId,
				status: SwapStatus.Completed,
			},
			swap.sourceToken,
			swap.destinationToken,
		)

		return SwapStatus.Completed
	}

	@OnQueueFailed({ name: TRANSFER_ETH_SWAP_JOB })
	async onTransferEthSwapFailed(job: Job<TransferSwapDto>, err: Error): Promise<void> {
		const { data } = job
		this.logger.debug(`${data.swapId}: ${err.message}: Retrying...`)

		await this.destinationSwapsQueue.add(
			TRANSFER_ETH_SWAP_JOB,
			{ swapId: data.swapId } as TransferSwapDto,
			{
				delay: ETH_BLOCK_TRACKING_INTERVAL,
				priority: QUEUE_HIGH_PRIORITY,
			},
		)
	}

	@OnQueueCompleted({ name: TRANSFER_ETH_SWAP_JOB })
	async onTransferEthSwapCompleted(
		job: Job<TransferSwapDto>,
		resultStatus: SwapStatus,
	): Promise<void> {
		const { data } = job
		if (!this.isSwapProcessable(resultStatus)) {
			this.emitEvent(data.swapId, resultStatus, 0)
			return
		}

		this.emitEvent(data.swapId, SwapStatus.Completed, TOTAL_CONFIRMATIONS)
		this.logger.log(`${data.swapId}: Swap transferred`)

		await this.sourceSwapsQueue.add(
			TRANSFER_TON_FEE_JOB,
			{ swapId: data.swapId } as TransferFeeDto,
			{ priority: QUEUE_LOW_PRIORITY },
		)
	}
}
