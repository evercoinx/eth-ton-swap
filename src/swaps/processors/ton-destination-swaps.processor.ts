import { InjectQueue, OnQueueCompleted, OnQueueFailed, Process, Processor } from "@nestjs/bull"
import { Logger } from "@nestjs/common"
import { Job, Queue } from "bull"
import { EventsService } from "src/common/events.service"
import { TonService } from "src/ton/ton.service"
import {
	TOTAL_BLOCK_CONFIRMATIONS,
	BLOCK_CONFIRMATION_TTL,
	SET_TON_TRANSACTION_HASH,
	TON_DESTINATION_SWAPS_QUEUE,
	TON_BLOCK_TRACKING_INTERVAL,
	TRANSFER_TON_SWAP_JOB,
} from "../constants"
import { TransferTonSwapDto } from "../dto/transfer-ton-swap.dto"
import { SetTonTransactionHashDto } from "../dto/set-ton-transaction-hash.dto"
import { SwapEvent } from "../interfaces/swap-event.interface"
import { SwapStatus } from "../swap.entity"
import { SwapsService } from "../swaps.service"

@Processor(TON_DESTINATION_SWAPS_QUEUE)
export class TonDestinationSwapsProcessor {
	private readonly logger = new Logger(TonDestinationSwapsProcessor.name)

	constructor(
		private readonly swapsService: SwapsService,
		private readonly eventsService: EventsService,
		private readonly tonService: TonService,
		@InjectQueue(TON_DESTINATION_SWAPS_QUEUE)
		private readonly destinationSwapsQueue: Queue,
	) {}

	@Process(TRANSFER_TON_SWAP_JOB)
	async transferTonSwap(job: Job<TransferTonSwapDto>): Promise<SwapStatus> {
		const { data } = job
		this.logger.debug(`Start transferring ton swap ${data.swapId}`)

		const swap = await this.swapsService.findOne(data.swapId)
		if (!swap) {
			this.logger.error(`Swap ${data.swapId} is not found`)
			return SwapStatus.Failed
		}

		if (data.ttl <= 0) {
			await this.swapsService.update(
				{
					id: swap.id,
					status: SwapStatus.Expired,
				},
				swap.sourceToken,
				swap.destinationToken,
			)

			this.logger.error(`Unable to transfer ton swap ${swap.id}: TTL reached ${data.ttl}`)
			return SwapStatus.Expired
		}

		await this.tonService.transfer(
			swap.destinationWallet.secretKey,
			swap.destinationAddress,
			swap.destinationAmount,
			swap.id,
		)

		await this.swapsService.update(
			{
				id: swap.id,
				status: SwapStatus.Completed,
			},
			swap.sourceToken,
			swap.destinationToken,
		)

		return SwapStatus.Completed
	}

	@OnQueueFailed({ name: TRANSFER_TON_SWAP_JOB })
	async onTransferTonSwapFailed(job: Job<TransferTonSwapDto>, err: Error): Promise<void> {
		const { data } = job
		this.logger.debug(`Swap ${data.swapId} failed. Error: ${err.message}. Retrying...`)

		await this.destinationSwapsQueue.add(
			TRANSFER_TON_SWAP_JOB,
			{
				swapId: data.swapId,
				ttl: data.ttl - 1,
			} as TransferTonSwapDto,
			{
				delay: TON_BLOCK_TRACKING_INTERVAL,
				priority: 1,
			},
		)
	}

	@OnQueueCompleted({ name: TRANSFER_TON_SWAP_JOB })
	async onTransferTonSwapCompleted(
		job: Job<TransferTonSwapDto>,
		resultStatus: SwapStatus,
	): Promise<void> {
		const { data } = job
		if (resultStatus === SwapStatus.Failed || resultStatus === SwapStatus.Expired) {
			this.emitEvent(data.swapId, resultStatus)
			return
		}

		await this.destinationSwapsQueue.add(
			SET_TON_TRANSACTION_HASH,
			{
				swapId: data.swapId,
				ttl: BLOCK_CONFIRMATION_TTL,
			} as SetTonTransactionHashDto,
			{
				delay: TON_BLOCK_TRACKING_INTERVAL,
				priority: 2,
			},
		)

		this.emitEvent(data.swapId, SwapStatus.Completed, TOTAL_BLOCK_CONFIRMATIONS)
		this.logger.log(`Swap ${data.swapId} completed successfully`)
	}

	@Process(SET_TON_TRANSACTION_HASH)
	async setTonTransactionHash(job: Job<SetTonTransactionHashDto>): Promise<void> {
		const { data } = job
		this.logger.debug(`Start setting ton transaction hash for swap ${data.swapId}`)

		const swap = await this.swapsService.findOne(data.swapId)
		if (!swap) {
			this.logger.error(`Swap ${data.swapId} is not found`)
			return
		}

		if (data.ttl <= 0) {
			this.logger.warn(`Unable to set ton transaction hash: TTL reached ${data.ttl} `)
			return
		}

		const destinationTransactionHash = await this.tonService.getTransactionHash(
			swap.destinationAddress,
			swap.updatedAt.getTime() - TON_BLOCK_TRACKING_INTERVAL,
		)

		await this.swapsService.update(
			{
				id: swap.id,
				destinationTransactionHash,
			},
			swap.sourceToken,
			swap.destinationToken,
		)
		this.logger.log(`Ton transaction hash for swap ${data.swapId} set successfully`)
	}

	@OnQueueFailed({ name: SET_TON_TRANSACTION_HASH })
	async onSetTonTransactionFailed(job: Job<SetTonTransactionHashDto>, err: Error): Promise<void> {
		const { data } = job
		this.logger.debug(`Swap ${data.swapId} failed. Error: ${err.message}. Retrying...`)

		await this.destinationSwapsQueue.add(
			SET_TON_TRANSACTION_HASH,
			{
				swapId: data.swapId,
				ttl: data.ttl - 1,
			} as SetTonTransactionHashDto,
			{
				delay: TON_BLOCK_TRACKING_INTERVAL,
				priority: 2,
			},
		)
	}

	private emitEvent(swapId: string, status: SwapStatus, currentConfirmations = 0): void {
		this.eventsService.emit({
			id: swapId,
			status,
			currentConfirmations,
			totalConfirmations: TOTAL_BLOCK_CONFIRMATIONS,
			createdAt: Date.now(),
		} as SwapEvent)
	}
}
