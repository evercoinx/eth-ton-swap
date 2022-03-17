import { InjectQueue, OnQueueCompleted, OnQueueFailed, Process, Processor } from "@nestjs/bull"
import { CACHE_MANAGER, Inject, Logger } from "@nestjs/common"
import { Job, Queue } from "bull"
import { Cache } from "cache-manager"
import { EventsService } from "src/common/events.service"
import { Block } from "src/ton/interfaces/block.interface"
import { TonService } from "src/ton/ton.service"
import {
	BLOCK_CONFIRMATION_TTL,
	CONFIRM_TON_BLOCK_JOB,
	CONFIRM_TON_SWAP_JOB,
	ETH_DESTINATION_SWAPS_QUEUE,
	QUEUE_HIGH_PRIORITY,
	QUEUE_LOW_PRIORITY,
	SET_TON_TRANSACTION_ID,
	TON_BLOCK_TRACKING_INTERVAL,
	TON_CACHE_TTL,
	TON_SOURCE_SWAPS_QUEUE,
	TOTAL_BLOCK_CONFIRMATIONS,
	TRANSFER_ETH_SWAP_JOB,
	TRANSFER_TON_FEE_JOB,
} from "../constants"
import { ConfirmBlockDto } from "../dto/confirm-block.dto"
import { ConfirmSwapDto } from "../dto/confirm-swap.dto"
import { SetTransactionIdDto } from "../dto/set-transaction-id.dto"
import { TransferFeeDto } from "../dto/transfer-fee.dto"
import { TransferSwapDto } from "../dto/transfer-swap.dto"
import { SwapEvent } from "../interfaces/swap-event.interface"
import { SwapStatus } from "../swap.entity"
import { SwapsService } from "../swaps.service"

@Processor(TON_SOURCE_SWAPS_QUEUE)
export class TonSourceSwapsProcessor {
	private static readonly cacheKeyPrefix = "ton:"
	private readonly logger = new Logger(TonSourceSwapsProcessor.name)

	constructor(
		@Inject(CACHE_MANAGER)
		private readonly cacheManager: Cache,
		private readonly swapsService: SwapsService,
		private readonly eventsService: EventsService,
		private readonly tonService: TonService,
		@InjectQueue(TON_SOURCE_SWAPS_QUEUE)
		private readonly sourceSwapsQueue: Queue,
		@InjectQueue(ETH_DESTINATION_SWAPS_QUEUE)
		private readonly destinationSwapsQueue: Queue,
	) {}

	@Process(CONFIRM_TON_SWAP_JOB)
	async conifrmTonSwap(job: Job<ConfirmSwapDto>): Promise<SwapStatus> {
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

		const inputTransaction = await this.tonService.getTransaction(
			swap.sourceWallet.address,
			swap.sourceAmount,
			swap.createdAt.getTime(),
			true,
		)
		if (!inputTransaction) {
			throw new Error("Transaction not found")
		}

		const outputTransaction = await this.tonService.getTransaction(
			inputTransaction.sourceAddress,
			swap.sourceAmount,
			swap.createdAt.getTime(),
			false,
		)
		if (!outputTransaction) {
			throw new Error("Transaction not found")
		}

		const block = await this.tonService.getLatestBlock()
		data.blockNumber = block.number

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
		this.logger.debug(`Swap ${data.swapId} failed. Error: ${err.message}. Retrying...`)

		await this.sourceSwapsQueue.add(
			CONFIRM_TON_SWAP_JOB,
			{
				swapId: data.swapId,
				ttl: data.ttl - 1,
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
		if (resultStatus === SwapStatus.Failed || resultStatus === SwapStatus.Expired) {
			this.emitEvent(data.swapId, resultStatus)
			return
		}

		this.emitEvent(data.swapId, SwapStatus.Confirmed, 0)
		this.logger.log(`Swap ${data.swapId} confirmed successfully`)

		await this.sourceSwapsQueue.add(
			CONFIRM_TON_BLOCK_JOB,
			{
				swapId: data.swapId,
				ttl: BLOCK_CONFIRMATION_TTL,
				blockNumber: data.blockNumber,
				blockConfirmations: 1,
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
		this.logger.debug(`Start confirming ton block ${data.blockNumber} for swap ${data.swapId}`)

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

			this.logger.error(
				`Unable to confirm ton block ${data.blockNumber} for swap ${swap.id}: TTL reached ${data.ttl}`,
			)
			return SwapStatus.Expired
		}

		await this.checkBlock(data.blockNumber)

		await this.swapsService.update(
			{
				id: swap.id,
				blockConfirmations: data.blockConfirmations,
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
		this.emitEvent(data.swapId, SwapStatus.Confirmed, data.blockConfirmations)
		this.logger.debug(`Swap ${data.swapId} failed. Error: ${err.message}. Retrying...`)

		await this.sourceSwapsQueue.add(
			CONFIRM_TON_BLOCK_JOB,
			{
				swapId: data.swapId,
				ttl: data.ttl - 1,
				blockNumber: data.blockNumber,
				blockConfirmations: data.blockConfirmations,
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
		if (resultStatus === SwapStatus.Failed || resultStatus === SwapStatus.Expired) {
			this.emitEvent(data.swapId, resultStatus, data.blockConfirmations)
			return
		}

		this.emitEvent(data.swapId, SwapStatus.Confirmed, data.blockConfirmations)
		this.logger.log(
			`Swap ${data.swapId} confirmed in block #${data.blockNumber} with count of ${data.blockConfirmations}`,
		)

		if (data.blockConfirmations < TOTAL_BLOCK_CONFIRMATIONS) {
			await this.sourceSwapsQueue.add(
				CONFIRM_TON_BLOCK_JOB,
				{
					swapId: data.swapId,
					ttl: BLOCK_CONFIRMATION_TTL,
					blockNumber: data.blockNumber + 1,
					blockConfirmations: data.blockConfirmations + 1,
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
				ttl: BLOCK_CONFIRMATION_TTL,
			} as TransferSwapDto,
			{
				priority: QUEUE_HIGH_PRIORITY,
			},
		)
	}

	@Process(TRANSFER_TON_FEE_JOB)
	async transferTonFee(job: Job<TransferFeeDto>): Promise<void> {
		const { data } = job
		this.logger.debug(`Start transferring ton fee for swap ${data.swapId}`)

		const swap = await this.swapsService.findOne(data.swapId)
		if (!swap) {
			this.logger.error(`Swap ${data.swapId} is not found`)
			return
		}

		if (data.ttl <= 0) {
			this.logger.warn(
				`Unable to transfer ton fee for swap ${swap.id}: TTL reached ${data.ttl}`,
			)
			return
		}

		const success = await this.tonService.transfer(
			swap.sourceWallet.secretKey,
			swap.collectorWallet.address,
			swap.fee,
			swap.id,
		)
		if (!success) {
			throw new Error("Transfer failed")
		}

		await this.swapsService.update(
			{
				id: swap.id,
				fee: swap.fee,
			},
			swap.sourceToken,
			swap.destinationToken,
		)

		this.logger.log(`Ton fee for swap ${data.swapId} transferred successfully`)
	}

	@OnQueueFailed({ name: TRANSFER_TON_FEE_JOB })
	async onTransferTonFeeFailed(job: Job<TransferFeeDto>, err: Error): Promise<void> {
		const { data } = job
		this.logger.debug(`Swap ${data.swapId} failed. Error: ${err.message}. Retrying...`)

		await this.sourceSwapsQueue.add(
			TRANSFER_TON_FEE_JOB,
			{
				swapId: data.swapId,
				ttl: data.ttl - 1,
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

		await this.sourceSwapsQueue.add(
			SET_TON_TRANSACTION_ID,
			{
				swapId: data.swapId,
				ttl: BLOCK_CONFIRMATION_TTL,
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
		this.logger.debug(`Start setting ton transaction id for swap ${data.swapId}`)

		const swap = await this.swapsService.findOne(data.swapId)
		if (!swap) {
			this.logger.error(`Swap ${data.swapId} is not found`)
			return
		}

		if (data.ttl <= 0) {
			this.logger.warn(`Unable to set ton transaction id: TTL reached ${data.ttl} `)
			return
		}

		const transaction = await this.tonService.getTransaction(
			swap.collectorWallet.address,
			swap.fee,
			swap.createdAt.getTime(),
			true,
		)
		if (!transaction) {
			throw new Error("Transaction not found")
		}

		await this.swapsService.update(
			{
				id: swap.id,
				collectorTransactionId: transaction.id,
			},
			swap.sourceToken,
			swap.destinationToken,
		)
		this.logger.log(`Ton transaction id for swap ${data.swapId} set successfully`)
	}

	@OnQueueFailed({ name: SET_TON_TRANSACTION_ID })
	async onSetTonTransactionFailed(job: Job<SetTransactionIdDto>, err: Error): Promise<void> {
		const { data } = job
		this.logger.debug(`Swap ${data.swapId} failed. Error: ${err.message}. Retrying...`)

		await this.sourceSwapsQueue.add(
			SET_TON_TRANSACTION_ID,
			{
				swapId: data.swapId,
				ttl: data.ttl - 1,
			} as SetTransactionIdDto,
			{
				delay: TON_BLOCK_TRACKING_INTERVAL,
				priority: QUEUE_LOW_PRIORITY,
			},
		)
	}

	private async checkBlock(blockNumber: number): Promise<Block> {
		const cacheKey = TonSourceSwapsProcessor.cacheKeyPrefix + blockNumber.toString()
		let block = await this.cacheManager.get<Block>(cacheKey)
		if (!block) {
			block = await this.tonService.getLatestBlock()
			if (!block || block.number < blockNumber) {
				throw new Error("Block not found")
			}
			this.cacheManager.set(cacheKey, block, { ttl: TON_CACHE_TTL })
		}
		return block
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
