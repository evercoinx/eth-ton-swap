import { CACHE_MANAGER, Inject } from "@nestjs/common"
import BigNumber from "bignumber.js"
import { Cache } from "cache-manager"
import { BlockWithTransactions, InfuraProvider, InjectEthersProvider } from "nestjs-ethers"
import { EventsService } from "src/common/events.service"
import { ETH_CACHE_TTL, TOTAL_BLOCK_CONFIRMATIONS } from "../constants"
import { SwapEvent } from "../interfaces/swap-event.interface"
import { Swap, SwapStatus } from "../swap.entity"
import { SwapsService } from "../swaps.service"

export class EthBaseSwapsProcessor {
	constructor(
		@Inject(CACHE_MANAGER) protected readonly cacheManager: Cache,
		protected readonly cacheKeyPrefix: string,
		@InjectEthersProvider() protected readonly infuraProvider: InfuraProvider,
		protected readonly swapsService: SwapsService,
		protected readonly eventsService: EventsService,
	) {}

	protected async getGasPrice(): Promise<BigNumber> {
		const cacheKey = this.cacheKeyPrefix + "gas_price"
		const cachedGasPrice = await this.cacheManager.get<string>(cacheKey)
		if (cachedGasPrice) {
			return new BigNumber(cachedGasPrice)
		}

		const gasPrice = (await this.infuraProvider.getGasPrice()).toString()
		this.cacheManager.set(cacheKey, gasPrice, { ttl: ETH_CACHE_TTL })
		return new BigNumber(gasPrice)
	}

	protected async getBlock(blockNumber: number): Promise<BlockWithTransactions> {
		const cacheKey = this.cacheKeyPrefix + blockNumber.toString()
		let block = await this.cacheManager.get<BlockWithTransactions>(cacheKey)
		if (!block) {
			block = await this.infuraProvider.getBlockWithTransactions(blockNumber)
			if (!block) {
				throw new Error("Block not found")
			}
			this.cacheManager.set(cacheKey, block, { ttl: ETH_CACHE_TTL })
		}
		return block
	}

	protected recalculateSwap(swap: Swap, sourceAmount: string): Swap {
		const [destinationAmount, fee] = this.swapsService.calculateDestinationAmountAndFee(
			sourceAmount,
			swap.sourceToken,
			swap.destinationToken,
		)

		if (new BigNumber(destinationAmount).lte(0)) {
			throw new Error("Destination amount below zero")
		}

		if (new BigNumber(fee).lte(0)) {
			throw new Error("Fee below zero")
		}

		swap.sourceAmount = sourceAmount
		swap.destinationAmount = destinationAmount
		swap.fee = fee
		return swap
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

	protected normalizeHex(hexStr: string): string {
		return hexStr.startsWith("0x") ? hexStr.slice(2) : hexStr
	}
}
