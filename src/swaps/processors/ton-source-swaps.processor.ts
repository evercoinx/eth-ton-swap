import { InjectQueue, OnQueueCompleted, OnQueueFailed, Process, Processor } from "@nestjs/bull"
import { Logger } from "@nestjs/common"
import { Job, Queue } from "bull"
import { EventsService } from "src/common/events.service"
import { TonService } from "src/ton/ton.service"
import {
	CONFIRM_TON_SWAP_JOB,
	BLOCK_CONFIRMATION_TTL,
	TON_SOURCE_SWAPS_QUEUE,
	TON_BLOCK_TRACKING_INTERVAL,
	TOTAL_BLOCK_CONFIRMATIONS,
	TRANSFER_ETH_SWAP_JOB,
} from "../constants"
import { ConfirmTonSwapDto } from "../dto/confirm-ton-swap.dto"
import { TransferEthSwapDto } from "../dto/transfer-eth-swap.dto"
import { SwapEvent } from "../interfaces/swap-event.interface"
import { SwapStatus } from "../swap.entity"
import { SwapsService } from "../swaps.service"

@Processor(TON_SOURCE_SWAPS_QUEUE)
export class TonSourceSwapsProcessor {
	private readonly logger = new Logger(TonSourceSwapsProcessor.name)

	constructor(
		private readonly swapsService: SwapsService,
		private readonly eventsService: EventsService,
		private readonly tonService: TonService,
		@InjectQueue(TON_SOURCE_SWAPS_QUEUE)
		private readonly sourceSwapsQueue: Queue,
	) {}

	@Process(CONFIRM_TON_SWAP_JOB)
	async conifrmTonSwap(job: Job<ConfirmTonSwapDto>): Promise<SwapStatus> {
		const { data } = job
		this.logger.debug(`Start confirming ton swap ${data.swapId}`)

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

			this.logger.error(`Unable to confirm ton swap ${swap.id}: TTL reached ${data.ttl}`)
			return SwapStatus.Expired
		}

		// Confirmation logic

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

	@OnQueueFailed({ name: CONFIRM_TON_SWAP_JOB })
	async onConfirmTonSwapFailed(job: Job<ConfirmTonSwapDto>, err: Error): Promise<void> {
		const { data } = job
		this.logger.debug(`Swap ${data.swapId} failed. Error: ${err.message}. Retrying...`)

		await this.sourceSwapsQueue.add(
			CONFIRM_TON_SWAP_JOB,
			{
				swapId: data.swapId,
				ttl: data.ttl - 1,
			} as ConfirmTonSwapDto,
			{
				delay: TON_BLOCK_TRACKING_INTERVAL,
				priority: 1,
			},
		)
	}

	@OnQueueCompleted({ name: CONFIRM_TON_SWAP_JOB })
	async onConfirmTonSwapCompleted(
		job: Job<ConfirmTonSwapDto>,
		resultStatus: SwapStatus,
	): Promise<void> {
		const { data } = job
		if (resultStatus === SwapStatus.Failed || resultStatus === SwapStatus.Expired) {
			this.emitEvent(data.swapId, resultStatus)
			return
		}

		await this.sourceSwapsQueue.add(
			TRANSFER_ETH_SWAP_JOB,
			{
				swapId: data.swapId,
				ttl: BLOCK_CONFIRMATION_TTL,
			} as TransferEthSwapDto,
			{
				delay: TON_BLOCK_TRACKING_INTERVAL,
				priority: 2,
			},
		)

		this.emitEvent(data.swapId, SwapStatus.Completed, TOTAL_BLOCK_CONFIRMATIONS)
		this.logger.log(`Swap ${data.swapId} completed successfully`)
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
