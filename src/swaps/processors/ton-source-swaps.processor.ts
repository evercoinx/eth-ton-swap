import { InjectQueue, OnQueueCompleted, OnQueueFailed, Process, Processor } from "@nestjs/bull"
import { CACHE_MANAGER, Inject, Logger } from "@nestjs/common"
import { Job, Queue } from "bull"
import { Cache } from "cache-manager"
import { EventsService } from "src/common/events.service"
import { GetBlock } from "src/ton/interfaces/get-block.interface"
import { TonService } from "src/ton/ton.service"
import {
	BLOCK_CONFIRMATION_TTL,
	CONFIRM_TON_BLOCK_JOB,
	CONFIRM_TON_SWAP_JOB,
	TON_BLOCK_TRACKING_INTERVAL,
	TON_CACHE_TTL,
	TON_SOURCE_SWAPS_QUEUE,
	TOTAL_BLOCK_CONFIRMATIONS,
} from "../constants"
import { ConfirmBlockDto } from "../dto/confirm-block.dto"
import { ConfirmSwapDto } from "../dto/confirm-swap.dto"
import { SwapEvent } from "../interfaces/swap-event.interface"
import { SwapStatus } from "../swap.entity"
import { SwapsService } from "../swaps.service"

@Processor(TON_SOURCE_SWAPS_QUEUE)
export class TonSourceSwapsProcessor {
	private readonly logger = new Logger(TonSourceSwapsProcessor.name)

	constructor(
		@Inject(CACHE_MANAGER)
		private readonly cacheManager: Cache,
		private readonly swapsService: SwapsService,
		private readonly eventsService: EventsService,
		private readonly tonService: TonService,
		@InjectQueue(TON_SOURCE_SWAPS_QUEUE)
		private readonly sourceSwapsQueue: Queue,
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

		const sourceTransactionHash = await this.tonService.getTransactionHash(
			swap.sourceWallet.address,
			swap.createdAt.getTime(),
		)
		if (!sourceTransactionHash) {
			throw new Error("Transaction not found")
		}

		await this.swapsService.update(
			{
				id: swap.id,
				sourceAddress: swap.sourceAddress,
				sourceAmount: swap.sourceAmount,
				sourceTransactionHash,
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
				priority: 1,
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
				priority: 1,
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
				priority: 1,
			},
		)
	}

	@OnQueueCompleted({ name: CONFIRM_TON_BLOCK_JOB })
	async onConfirmEthBlockCompleted(
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
					delay: TON_BLOCK_TRACKING_INTERVAL,
					priority: 1,
				},
			)
			return
		}
	}

	private async checkBlock(blockNumber: number): Promise<GetBlock> {
		const cacheKey = blockNumber.toString()
		let block = await this.cacheManager.get<GetBlock>(cacheKey)
		if (!block) {
			block = await this.tonService.getBlock()
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