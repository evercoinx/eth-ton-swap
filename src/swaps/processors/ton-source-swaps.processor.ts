import { InjectQueue, OnQueueCompleted, OnQueueFailed, Process, Processor } from "@nestjs/bull"
import { CACHE_MANAGER, Inject, Logger } from "@nestjs/common"
import { Job, Queue } from "bull"
import { Cache } from "cache-manager"
import { EventsService } from "src/common/events.service"
import { TonService } from "src/ton/ton.service"
import {
	CONFIRM_TON_BLOCK_JOB,
	CONFIRM_TON_SWAP_JOB,
	ETH_DESTINATION_SWAPS_QUEUE,
	QUEUE_HIGH_PRIORITY,
	QUEUE_LOW_PRIORITY,
	SET_TON_TRANSACTION_ID,
	TON_BLOCK_TRACKING_INTERVAL,
	TON_SOURCE_SWAPS_QUEUE,
	TOTAL_CONFIRMATIONS,
	TRANSFER_ETH_SWAP_JOB,
	TRANSFER_TON_FEE_JOB,
} from "../constants"
import { ConfirmBlockDto } from "../dto/confirm-block.dto"
import { ConfirmSwapDto } from "../dto/confirm-swap.dto"
import { SetTransactionIdDto } from "../dto/set-transaction-id.dto"
import { TransferFeeDto } from "../dto/transfer-fee.dto"
import { TransferSwapDto } from "../dto/transfer-swap.dto"
import { SwapStatus } from "../swap.entity"
import { SwapsService } from "../swaps.service"
import { TonBaseSwapsProcessor } from "./ton-base-swaps.processor"

@Processor(TON_SOURCE_SWAPS_QUEUE)
export class TonSourceSwapsProcessor extends TonBaseSwapsProcessor {
	private readonly logger = new Logger(TonSourceSwapsProcessor.name)

	constructor(
		@Inject(CACHE_MANAGER) cacheManager: Cache,
		tonService: TonService,
		swapsService: SwapsService,
		eventsService: EventsService,
		@InjectQueue(TON_SOURCE_SWAPS_QUEUE) private readonly sourceSwapsQueue: Queue,
		@InjectQueue(ETH_DESTINATION_SWAPS_QUEUE) private readonly destinationSwapsQueue: Queue,
	) {
		super(cacheManager, "ton:src", tonService, swapsService, eventsService)
	}

	@Process(CONFIRM_TON_SWAP_JOB)
	async conifrmTonSwap(job: Job<ConfirmSwapDto>): Promise<SwapStatus> {
		const { data } = job
		this.logger.debug(`${data.swapId}: Start confirming swap by block ${data.blockNumber}`)

		const swap = await this.swapsService.findById(data.swapId)
		if (!swap) {
			this.logger.error(`${data.swapId}: Swap not found`)
			return SwapStatus.Failed
		}

		if (swap.status === SwapStatus.Canceled) {
			this.logger.warn(`${swap.id}: Swap canceled`)
			return SwapStatus.Canceled
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

		const inputTransaction = await this.tonService.findTransaction(
			swap.sourceWallet.address,
			swap.sourceAmount,
			swap.createdAt.getTime(),
			true,
		)

		const outputTransaction = await this.tonService.findTransaction(
			inputTransaction.sourceAddress,
			swap.sourceAmount,
			swap.createdAt.getTime(),
			false,
		)

		await this.tonService.getLatestBlock()

		await this.swapsService.update(
			{
				id: swap.id,
				sourceAddress: inputTransaction.sourceAddress,
				sourceAmount: swap.sourceAmount,
				sourceTransactionId: outputTransaction.id,
				destinationAmount: swap.destinationAmount,
				fee: swap.fee,
				status: SwapStatus.Confirmed,
			},
			swap.sourceToken,
			swap.destinationToken,
		)

		return SwapStatus.Confirmed
	}

	@OnQueueFailed({ name: CONFIRM_TON_SWAP_JOB })
	async onConfirmTonSwapFailed(job: Job<ConfirmSwapDto>, err: Error): Promise<void> {
		const { data } = job
		this.emitEvent(data.swapId, SwapStatus.Pending, 0)
		this.logger.debug(`${data.swapId}: ${err.message}: Retrying...`)

		await this.sourceSwapsQueue.add(
			CONFIRM_TON_SWAP_JOB,
			{
				swapId: data.swapId,
				blockNumber: data.blockNumber,
			} as ConfirmSwapDto,
			{
				delay: TON_BLOCK_TRACKING_INTERVAL,
				priority: QUEUE_HIGH_PRIORITY,
			},
		)
	}

	@OnQueueCompleted({ name: CONFIRM_TON_SWAP_JOB })
	async onConfirmTonSwapCompleted(
		job: Job<ConfirmSwapDto>,
		resultStatus: SwapStatus,
	): Promise<void> {
		const { data } = job
		if (!this.isSwapProcessable(resultStatus)) {
			this.emitEvent(data.swapId, resultStatus, 0)
			return
		}

		this.emitEvent(data.swapId, SwapStatus.Confirmed, 1)
		this.logger.log(`${data.swapId}: Swap confirmed 1 time by block ${data.blockNumber}`)

		await this.sourceSwapsQueue.add(
			CONFIRM_TON_BLOCK_JOB,
			{
				swapId: data.swapId,
				blockNumber: data.blockNumber + 1,
				confirmations: 2,
			} as ConfirmBlockDto,
			{
				delay: TON_BLOCK_TRACKING_INTERVAL,
				priority: QUEUE_HIGH_PRIORITY,
			},
		)
	}

	@Process(CONFIRM_TON_BLOCK_JOB)
	async confirmTonBlock(job: Job<ConfirmBlockDto>): Promise<SwapStatus> {
		const { data } = job
		this.logger.debug(`${data.swapId}: Start confirming swap by block ${data.blockNumber}`)

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

		await this.getBlock(data.blockNumber)

		await this.swapsService.update(
			{
				id: swap.id,
				confirmations: data.confirmations,
				status: SwapStatus.Confirmed,
			},
			swap.sourceToken,
			swap.destinationToken,
		)

		return SwapStatus.Confirmed
	}

	@OnQueueFailed({ name: CONFIRM_TON_BLOCK_JOB })
	async onConfirmTonBlockFailed(job: Job<ConfirmBlockDto>, err: Error): Promise<void> {
		const { data } = job
		this.emitEvent(data.swapId, SwapStatus.Confirmed, data.confirmations)
		this.logger.debug(`${data.swapId}: ${err.message}: Retrying...`)

		await this.sourceSwapsQueue.add(
			CONFIRM_TON_BLOCK_JOB,
			{
				swapId: data.swapId,
				blockNumber: data.blockNumber,
				confirmations: data.confirmations,
			} as ConfirmBlockDto,
			{
				delay: TON_BLOCK_TRACKING_INTERVAL,
				priority: QUEUE_HIGH_PRIORITY,
			},
		)
	}

	@OnQueueCompleted({ name: CONFIRM_TON_BLOCK_JOB })
	async onConfirmTonBlockCompleted(
		job: Job<ConfirmBlockDto>,
		resultStatus: SwapStatus,
	): Promise<void> {
		const { data } = job
		if (!this.isSwapProcessable(resultStatus)) {
			this.emitEvent(data.swapId, resultStatus, data.confirmations)
			return
		}

		this.emitEvent(data.swapId, SwapStatus.Confirmed, data.confirmations)
		this.logger.log(
			`${data.swapId}: Swap confirmed ${data.confirmations} times by block ${data.blockNumber}`,
		)

		if (data.confirmations < TOTAL_CONFIRMATIONS) {
			await this.sourceSwapsQueue.add(
				CONFIRM_TON_BLOCK_JOB,
				{
					swapId: data.swapId,
					blockNumber: data.blockNumber + 1,
					confirmations: data.confirmations + 1,
				} as ConfirmBlockDto,
				{
					delay: TON_BLOCK_TRACKING_INTERVAL / 2,
					priority: QUEUE_HIGH_PRIORITY,
				},
			)
			return
		}

		await this.destinationSwapsQueue.add(
			TRANSFER_ETH_SWAP_JOB,
			{
				swapId: data.swapId,
			} as TransferSwapDto,
			{
				priority: QUEUE_HIGH_PRIORITY,
			},
		)
	}

	@Process(TRANSFER_TON_FEE_JOB)
	async transferTonFee(job: Job<TransferFeeDto>): Promise<void> {
		const { data } = job
		this.logger.debug(`${data.swapId}: Start transferring fee`)

		const swap = await this.swapsService.findById(data.swapId)
		if (!swap) {
			this.logger.error(`${data.swapId}: Swap not found`)
			return
		}

		if (swap.expiresAt < new Date()) {
			this.logger.warn(`${swap.id}: Swap expired`)
			return
		}

		await this.tonService.transferToncoin(
			swap.sourceWallet.secretKey,
			swap.collectorWallet.address,
			swap.fee,
			swap.id,
		)

		await this.swapsService.update(
			{
				id: swap.id,
				fee: swap.fee,
			},
			swap.sourceToken,
			swap.destinationToken,
		)
	}

	@OnQueueFailed({ name: TRANSFER_TON_FEE_JOB })
	async onTransferTonFeeFailed(job: Job<TransferFeeDto>, err: Error): Promise<void> {
		const { data } = job
		this.logger.debug(`${data.swapId}: ${err.message}: Retrying...`)

		await this.sourceSwapsQueue.add(
			TRANSFER_TON_FEE_JOB,
			{
				swapId: data.swapId,
			} as TransferFeeDto,
			{
				delay: TON_BLOCK_TRACKING_INTERVAL,
				priority: QUEUE_LOW_PRIORITY,
			},
		)
	}

	@OnQueueCompleted({ name: TRANSFER_TON_FEE_JOB })
	async onTransferTonFeeCompleted(job: Job<TransferFeeDto>): Promise<void> {
		const { data } = job
		this.logger.log(`${data.swapId}: Fee transferred`)

		await this.sourceSwapsQueue.add(
			SET_TON_TRANSACTION_ID,
			{
				swapId: data.swapId,
			} as SetTransactionIdDto,
			{
				delay: TON_BLOCK_TRACKING_INTERVAL,
				priority: QUEUE_LOW_PRIORITY,
			},
		)
	}

	@Process(SET_TON_TRANSACTION_ID)
	async setTonTransactionId(job: Job<SetTransactionIdDto>): Promise<void> {
		const { data } = job
		this.logger.debug(`${data.swapId}: Start setting transaction id`)

		const swap = await this.swapsService.findById(data.swapId)
		if (!swap) {
			this.logger.error(`${data.swapId}: Swap not found`)
			return
		}

		if (swap.expiresAt < new Date()) {
			this.logger.warn(`${swap.id}: Swap expired`)
			return
		}

		const transaction = await this.tonService.findTransaction(
			swap.collectorWallet.address,
			swap.fee,
			swap.createdAt.getTime(),
			true,
		)

		await this.swapsService.update(
			{
				id: swap.id,
				collectorTransactionId: transaction.id,
			},
			swap.sourceToken,
			swap.destinationToken,
		)
		this.logger.log(`${data.swapId}: Transaction id set`)
	}

	@OnQueueFailed({ name: SET_TON_TRANSACTION_ID })
	async onSetTonTransactionFailed(job: Job<SetTransactionIdDto>, err: Error): Promise<void> {
		const { data } = job
		this.logger.debug(`${data.swapId}: ${err.message}: Retrying...`)

		await this.sourceSwapsQueue.add(
			SET_TON_TRANSACTION_ID,
			{
				swapId: data.swapId,
			} as SetTransactionIdDto,
			{
				delay: TON_BLOCK_TRACKING_INTERVAL,
				priority: QUEUE_LOW_PRIORITY,
			},
		)
	}
}
