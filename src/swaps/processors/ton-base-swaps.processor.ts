import { CACHE_MANAGER, Inject } from "@nestjs/common"
import { Cache } from "cache-manager"
import { EventsService } from "src/common/events.service"
import { TON_CACHE_TTL } from "src/ton/constants"
import { Block } from "src/ton/interfaces/block.interface"
import { TonBlockchainProvider } from "src/ton/ton-blockchain.provider"
import { TonContractProvider } from "src/ton/ton-contract.provider"
import { WalletsService } from "src/wallets/wallets.service"
import { TOTAL_SWAP_CONFIRMATIONS } from "../constants"
import { SwapStatus } from "../enums/swap-status.enum"
import { SwapEvent } from "../interfaces/swap-event.interface"
import { SwapsService } from "../swaps.service"

export class TonBaseSwapsProcessor {
	constructor(
		@Inject(CACHE_MANAGER) protected readonly cacheManager: Cache,
		protected readonly cacheKeyPrefix: string,
		protected readonly tonBlockchain: TonBlockchainProvider,
		protected readonly tonContract: TonContractProvider,
		protected readonly swapsService: SwapsService,
		protected readonly eventsService: EventsService,
		protected readonly walletsService: WalletsService,
	) {}

	protected async getBlock(blockNumber: number): Promise<Block> {
		const cacheKey = this.cacheKeyPrefix + blockNumber.toString()
		const cachedBlock = await this.cacheManager.get<Block>(cacheKey)
		if (cachedBlock) {
			return cachedBlock
		}

		const block = await this.tonBlockchain.getLatestBlock()
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
			totalConfirmations: TOTAL_SWAP_CONFIRMATIONS,
			createdAt: Date.now(),
		} as SwapEvent)
	}

	protected isSwapProcessable(status: SwapStatus): boolean {
		return ![SwapStatus.Failed, SwapStatus.Expired, SwapStatus.Canceled].includes(status)
	}
}
