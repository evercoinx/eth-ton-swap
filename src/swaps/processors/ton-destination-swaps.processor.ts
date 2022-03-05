import { InjectQueue, OnQueueCompleted, OnQueueFailed, Process, Processor } from "@nestjs/bull"
import { Logger } from "@nestjs/common"
import { Job, Queue } from "bull"
import { EventsService } from "src/common/events.service"
import { TonService } from "src/ton/ton.service"
import {
	TOTAL_BLOCK_CONFIRMATIONS,
	BLOCK_CONFIRMATION_TTL,
	TON_DESTINATION_SWAPS_QUEUE,
	TRANSFER_DESTINATION_SWAP_JOB,
	GET_DESTINATION_TRANSACTION_HASH,
	TON_BLOCK_TRACKING_INTERVAL,
} from "../constants"
import { ConfirmDestinationSwapDto } from "../dto/confirm-destination-swap.dto"
import { GetTransactionHashDto } from "../dto/get-transaction-hash.dto"
import { SwapEvent } from "../interfaces/swap-event.interface"
import { Swap, SwapStatus } from "../swap.entity"
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

	@Process(TRANSFER_DESTINATION_SWAP_JOB)
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
				swap.blockConfirmations !== TOTAL_BLOCK_CONFIRMATIONS
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
				swap.id,
			)

			await this.swapsService.update(
				{
					id: swap.id,
					sourceAddress: swap.sourceAddress,
					sourceAmount: swap.sourceAmount,
					sourceTransactionHash: swap.sourceTransactionHash,
					destinationAmount: swap.destinationAmount,
					fee: swap.fee,
					status: SwapStatus.Completed,
					blockConfirmations: swap.blockConfirmations,
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

	@OnQueueFailed({ name: TRANSFER_DESTINATION_SWAP_JOB })
	async onTransferDestinationSwapFailed(
		job: Job<ConfirmDestinationSwapDto>,
		err: Error,
	): Promise<void> {
		const { data } = job
		data.ttl -= 1

		await this.destinationSwapsQueue.add(TRANSFER_DESTINATION_SWAP_JOB, data, {
			delay: TON_BLOCK_TRACKING_INTERVAL,
			priority: 1,
		})
	}

	@OnQueueCompleted({ name: TRANSFER_DESTINATION_SWAP_JOB })
	async onTransferDestinationSwapCompleted(
		job: Job<ConfirmDestinationSwapDto>,
		resultStatus: SwapStatus,
	): Promise<void> {
		const { data } = job
		if (resultStatus !== SwapStatus.Completed) {
			this.emitEvent(data.swapId, resultStatus)
			return
		}

		const jobData: GetTransactionHashDto = {
			swapId: data.swapId,
			ttl: BLOCK_CONFIRMATION_TTL,
		}
		await this.destinationSwapsQueue.add(GET_DESTINATION_TRANSACTION_HASH, jobData, {
			delay: TON_BLOCK_TRACKING_INTERVAL,
			priority: 3,
		})

		this.emitEvent(data.swapId, SwapStatus.Completed, TOTAL_BLOCK_CONFIRMATIONS)
		this.logger.log(`Swap ${data.swapId} completed successfully`)
	}

	@Process(GET_DESTINATION_TRANSACTION_HASH)
	async getDestinationTransaction(job: Job<GetTransactionHashDto>): Promise<void> {
		try {
			const { data } = job
			this.logger.debug(`Start getting destination transaction for swap ${data.swapId}`)

			const swap = await this.swapsService.findOne(data.swapId)
			if (!swap) {
				this.logger.error(`Swap ${data.swapId} is not found`)
				return
			}

			if (swap.status !== SwapStatus.Completed || data.ttl <= 0) {
				return
			}

			const destinationTransactionHash = await this.tonService.getTransactionHash(
				swap.destinationAddress,
				swap.updatedAt.getTime() - 2000,
			)

			await this.swapsService.update(
				{
					id: swap.id,
					sourceAddress: swap.sourceAddress,
					sourceAmount: swap.sourceAmount,
					sourceTransactionHash: swap.sourceTransactionHash,
					destinationAmount: swap.destinationAmount,
					destinationTransactionHash,
					fee: swap.fee,
					status: SwapStatus.Completed,
					blockConfirmations: swap.blockConfirmations,
				},
				swap.sourceToken,
				swap.destinationToken,
			)
			this.logger.log(`Destination transaction hash for swap ${data.swapId} set successfully`)
		} catch (err: unknown) {
			this.logger.debug(err)
			throw err
		}
	}

	@OnQueueFailed({ name: GET_DESTINATION_TRANSACTION_HASH })
	async onGetDestinationTransactionFailed(
		job: Job<GetTransactionHashDto>,
		err: Error,
	): Promise<void> {
		const { data } = job
		data.ttl -= 1

		await this.destinationSwapsQueue.add(GET_DESTINATION_TRANSACTION_HASH, data, {
			delay: TON_BLOCK_TRACKING_INTERVAL,
			priority: 3,
		})
	}

	private async rejectSwap(swap: Swap, errorMessage: string, status: SwapStatus): Promise<void> {
		await this.swapsService.update(
			{
				id: swap.id,
				sourceAddress: swap.sourceAddress,
				sourceAmount: swap.sourceAmount,
				sourceTransactionHash: swap.sourceTransactionHash,
				destinationAmount: swap.destinationAmount,
				destinationTransactionHash: swap.destinationTransactionHash,
				fee: swap.fee,
				status,
				blockConfirmations: swap.blockConfirmations,
			},
			swap.sourceToken,
			swap.destinationToken,
		)

		this.logger.error(`Swap ${swap.id} failed: ${errorMessage}`)
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
