import { CACHE_MANAGER, Inject } from "@nestjs/common"
import { Cache } from "cache-manager"
import { EventsService } from "src/common/events.service"
import { Block } from "src/ton/interfaces/block.interface"
import { TonService } from "src/ton/ton.service"
import { TON_CACHE_TTL, TOTAL_BLOCK_CONFIRMATIONS } from "../constants"
import { SwapEvent } from "../interfaces/swap-event.interface"
import { SwapStatus } from "../swap.entity"
import { SwapsService } from "../swaps.service"

export class TonBaseSwapsProcessor {
	constructor(
		@Inject(CACHE_MANAGER) protected readonly cacheManager: Cache,
		protected readonly cacheKeyPrefix: string,
		protected readonly tonService: TonService,
		protected readonly swapsService: SwapsService,
		protected readonly eventsService: EventsService,
	) {}

	protected async checkBlock(blockNumber: number): Promise<Block> {
		const cacheKey = this.cacheKeyPrefix + blockNumber.toString()
		const cachedBlock = await this.cacheManager.get<Block>(cacheKey)
		if (cachedBlock) {
			return cachedBlock
		}

		const block = await this.tonService.getLatestBlock()
		if (!block || block.number < blockNumber) {
			throw new Error("Block not found")
		}
		this.cacheManager.set(cacheKey, block, { ttl: TON_CACHE_TTL })
		return block
	}

	protected emitEvent(swapId: string, status: SwapStatus, currentConfirmations: number): void {
		this.eventsService.emit({
			id: swapId,
			status,
			currentConfirmations,
			totalConfirmations: TOTAL_BLOCK_CONFIRMATIONS,
			createdAt: Date.now(),
		} as SwapEvent)
	}
}
