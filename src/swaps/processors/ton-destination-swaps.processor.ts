import { InjectQueue, OnQueueCompleted, OnQueueFailed, Process, Processor } from "@nestjs/bull"
import { CACHE_MANAGER, Inject, Logger } from "@nestjs/common"
import { Job, Queue } from "bull"
import { Cache } from "cache-manager"
import { EventsService } from "src/common/events.service"
import { TonService } from "src/ton/ton.service"
import {
	ETH_SOURCE_SWAPS_QUEUE,
	QUEUE_HIGH_PRIORITY,
	QUEUE_LOW_PRIORITY,
	QUEUE_MEDIUM_PRIORITY,
	SET_TON_TRANSACTION_ID,
	TON_BLOCK_TRACKING_INTERVAL,
	TON_DESTINATION_SWAPS_QUEUE,
	TOTAL_BLOCK_CONFIRMATIONS,
	TRANSFER_ETH_FEE_JOB,
	TRANSFER_TON_SWAP_JOB,
} from "../constants"
import { SetTransactionIdDto } from "../dto/set-transaction-id.dto"
import { TransferFeeDto } from "../dto/transfer-fee.dto"
import { TransferSwapDto } from "../dto/transfer-swap.dto"
import { SwapStatus } from "../swap.entity"
import { SwapsService } from "../swaps.service"
import { TonBaseSwapsProcessor } from "./ton-base-swaps.processor"

@Processor(TON_DESTINATION_SWAPS_QUEUE)
export class TonDestinationSwapsProcessor extends TonBaseSwapsProcessor {
	private readonly logger = new Logger(TonDestinationSwapsProcessor.name)

	constructor(
		@Inject(CACHE_MANAGER) cacheManager: Cache,
		tonService: TonService,
		swapsService: SwapsService,
		eventsService: EventsService,
		@InjectQueue(TON_DESTINATION_SWAPS_QUEUE) private readonly destinationSwapsQueue: Queue,
		@InjectQueue(ETH_SOURCE_SWAPS_QUEUE) private readonly sourceSwapsQueue: Queue,
	) {
		super(cacheManager, "ton:dst", tonService, swapsService, eventsService)
	}

	@Process(TRANSFER_TON_SWAP_JOB)
	async transferTonSwap(job: Job<TransferSwapDto>): Promise<SwapStatus> {
		const { data } = job
		this.logger.debug(`${data.swapId}: Start transferring swap`)

		const swap = await this.swapsService.findById(data.swapId)
		if (!swap) {
			this.logger.error(`${data.swapId}: Swap not found`)
			return SwapStatus.Failed
		}

		if (swap.expiresAt < new Date()) {
			await this.swapsService.update(
				{
					id: swap.id,
					status: SwapStatus.Expired,
				},
				swap.sourceToken,
				swap.destinationToken,
			)

			this.logger.error(`${swap.id}: Swap expired`)
			return SwapStatus.Expired
		}

		await this.tonService.transferToncoin(
			swap.destinationWallet.secretKey,
			swap.destinationAddress,
			swap.destinationAmount,
			swap.id,
		)
		return SwapStatus.Confirmed
	}

	@OnQueueFailed({ name: TRANSFER_TON_SWAP_JOB })
	async onTransferTonSwapFailed(job: Job<TransferSwapDto>, err: Error): Promise<void> {
		const { data } = job
		this.logger.debug(`${data.swapId}: ${err.message}: Retrying...`)

		await this.destinationSwapsQueue.add(
			TRANSFER_TON_SWAP_JOB,
			{
				swapId: data.swapId,
			} as TransferSwapDto,
			{
				delay: TON_BLOCK_TRACKING_INTERVAL,
				priority: QUEUE_HIGH_PRIORITY,
			},
		)
	}

	@OnQueueCompleted({ name: TRANSFER_TON_SWAP_JOB })
	async onTransferTonSwapCompleted(
		job: Job<TransferSwapDto>,
		resultStatus: SwapStatus,
	): Promise<void> {
		const { data } = job
		if (!this.isSwapProcessable(resultStatus)) {
			this.emitEvent(data.swapId, resultStatus, 0)
			return
		}

		this.logger.log(`${data.swapId}: Swap transferred`)

		await this.destinationSwapsQueue.add(
			SET_TON_TRANSACTION_ID,
			{
				swapId: data.swapId,
			} as SetTransactionIdDto,
			{
				delay: TON_BLOCK_TRACKING_INTERVAL,
				priority: QUEUE_HIGH_PRIORITY,
			},
		)
	}

	@Process(SET_TON_TRANSACTION_ID)
	async setTonTransactionId(job: Job<SetTransactionIdDto>): Promise<SwapStatus> {
		const { data } = job
		this.logger.debug(`${data.swapId}: Start setting transaction id`)

		const swap = await this.swapsService.findById(data.swapId)
		if (!swap) {
			this.logger.error(`${data.swapId}: Swap not found`)
			return SwapStatus.Failed
		}

		if (swap.expiresAt < new Date()) {
			await this.swapsService.update(
				{
					id: swap.id,
					status: SwapStatus.Expired,
				},
				swap.sourceToken,
				swap.destinationToken,
			)

			this.logger.error(`${swap.id}: Swap expired`)
			return SwapStatus.Expired
		}

		const transaction = await this.tonService.findTransaction(
			swap.destinationAddress,
			swap.destinationAmount,
			swap.createdAt.getTime(),
			true,
		)

		await this.swapsService.update(
			{
				id: swap.id,
				destinationTransactionId: transaction.id,
				status: SwapStatus.Completed,
			},
			swap.sourceToken,
			swap.destinationToken,
		)

		return SwapStatus.Completed
	}

	@OnQueueFailed({ name: SET_TON_TRANSACTION_ID })
	async onSetTonTransactionIdFailed(job: Job<SetTransactionIdDto>, err: Error): Promise<void> {
		const { data } = job
		this.logger.debug(`${data.swapId}: ${err.message}: Retrying...`)

		await this.destinationSwapsQueue.add(
			SET_TON_TRANSACTION_ID,
			{
				swapId: data.swapId,
			} as SetTransactionIdDto,
			{
				delay: TON_BLOCK_TRACKING_INTERVAL,
				priority: QUEUE_MEDIUM_PRIORITY,
			},
		)
	}

	@OnQueueCompleted({ name: SET_TON_TRANSACTION_ID })
	async onSetTonTransactionIdCompleted(
		job: Job<TransferSwapDto>,
		resultStatus: SwapStatus,
	): Promise<void> {
		const { data } = job
		if (!this.isSwapProcessable(resultStatus)) {
			this.emitEvent(data.swapId, resultStatus, 0)
			return
		}

		this.emitEvent(data.swapId, SwapStatus.Completed, TOTAL_BLOCK_CONFIRMATIONS)
		this.logger.log(`${data.swapId}: Set transaction id`)

		await this.sourceSwapsQueue.add(
			TRANSFER_ETH_FEE_JOB,
			{
				swapId: data.swapId,
			} as TransferFeeDto,
			{
				priority: QUEUE_LOW_PRIORITY,
			},
		)
	}
}
