import { InjectQueue, OnQueueCompleted, OnQueueFailed, Process, Processor } from "@nestjs/bull"
import { Logger } from "@nestjs/common"
import { Job, Queue } from "bull"
import { EventsService } from "src/common/events.service"
import { TonService } from "src/ton/ton.service"
import {
	BLOCK_CONFIRMATION_COUNT,
	DESTINATION_SWAPS_QUEUE,
	DESTINATION_SWAP_CONFIRMATION_JOB,
	TON_BLOCK_TRACKING_INTERVAL,
} from "../constants"
import { ConfirmDestinationSwapDto } from "../dto/confirm-destination-swap.dto"
import { SwapEvent } from "../interfaces/swap-event.interface"
import { Swap, SwapStatus } from "../swap.entity"
import { SwapsService } from "../swaps.service"

@Processor(DESTINATION_SWAPS_QUEUE)
export class DestinationSwapsProcessor {
	private readonly logger = new Logger(DestinationSwapsProcessor.name)

	constructor(
		private readonly swapsService: SwapsService,
		private readonly eventsService: EventsService,
		private readonly tonService: TonService,
		@InjectQueue(DESTINATION_SWAPS_QUEUE)
		private readonly destinationSwapsQueue: Queue,
	) {}

	@Process(DESTINATION_SWAP_CONFIRMATION_JOB)
	async transferDestinationSwap(job: Job<ConfirmDestinationSwapDto>): Promise<SwapStatus> {
		try {
			const { data } = job
			this.logger.debug(`Start transferring destination swap ${data.swapId}`)

			const swap = await this.swapsService.findOne(data.swapId)
			if (!swap) {
				this.logger.error(`Swap ${data.swapId} is not found`)
				return SwapStatus.Failed
			}

			if (
				swap.status !== SwapStatus.Confirmed ||
				swap.confirmedBlockCount !== BLOCK_CONFIRMATION_COUNT
			) {
				await this.rejectSwap(
					swap,
					`Swap ${data.swapId} should be in fully confirmed status: skipped`,
					SwapStatus.Failed,
				)
				return SwapStatus.Failed
			}

			if (data.ttl <= 0) {
				await this.rejectSwap(swap, `TTL reached ${data.ttl}`, SwapStatus.Expired)
				return SwapStatus.Expired
			}

			await this.tonService.transfer(
				swap.destinationWallet.secretKey,
				swap.destinationAddress,
				swap.destinationAmount,
			)

			await this.swapsService.update(
				{
					id: data.swapId,
					sourceAddress: swap.sourceAddress,
					sourceAmount: swap.sourceAmount,
					destinationAmount: swap.destinationAmount,
					fee: swap.fee,
					status: SwapStatus.Completed,
					confirmedBlockCount: swap.confirmedBlockCount,
				},
				swap.sourceToken,
				swap.destinationToken,
			)

			return SwapStatus.Completed
		} catch (err: unknown) {
			this.logger.debug(err)
			throw err
		}
	}

	@OnQueueFailed({ name: DESTINATION_SWAP_CONFIRMATION_JOB })
	async onTransferDestinationSwapFailed(
		job: Job<ConfirmDestinationSwapDto>,
		err: Error,
	): Promise<void> {
		const { data } = job
		data.ttl -= 1

		await this.destinationSwapsQueue.add(DESTINATION_SWAP_CONFIRMATION_JOB, data, {
			delay: TON_BLOCK_TRACKING_INTERVAL,
		})
	}

	@OnQueueCompleted({ name: DESTINATION_SWAP_CONFIRMATION_JOB })
	async onTransferDestinationSwapCompleted(
		job: Job<ConfirmDestinationSwapDto>,
		resultStatus: SwapStatus,
	): Promise<void> {
		const { data } = job
		if (resultStatus !== SwapStatus.Completed) {
			this.emitEvent(data.swapId, resultStatus)
			return
		}

		this.emitEvent(data.swapId, SwapStatus.Completed, BLOCK_CONFIRMATION_COUNT)
		this.logger.log(`Swap ${data.swapId} completed successfully`)
	}

	private async rejectSwap(swap: Swap, errorMessage: string, status: SwapStatus): Promise<void> {
		await this.swapsService.update(
			{
				id: swap.id,
				sourceAddress: swap.sourceAddress,
				sourceAmount: swap.sourceAmount,
				destinationAmount: swap.destinationAmount,
				fee: swap.fee,
				status,
				confirmedBlockCount: swap.confirmedBlockCount,
			},
			swap.sourceToken,
			swap.destinationToken,
		)

		this.logger.error(`Swap ${swap.id} failed: ${errorMessage}`)
	}

	private emitEvent(swapId: string, status: SwapStatus, confirmedBlockCount = 0): void {
		this.eventsService.emit({
			id: swapId,
			status,
			confirmedBlockCount,
			totalBlockCount: BLOCK_CONFIRMATION_COUNT,
			createdAt: Date.now(),
		} as SwapEvent)
	}
}
