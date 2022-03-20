import { CACHE_MANAGER, Inject } from "@nestjs/common"
import { Cache } from "cache-manager"
import {
	BigNumber,
	BlockWithTransactions,
	InfuraProvider,
	InjectEthersProvider,
} from "nestjs-ethers"
import { EventsService } from "src/common/events.service"
import { ETH_CACHE_TTL, TOTAL_BLOCK_CONFIRMATIONS } from "../constants"
import { SwapEvent } from "../interfaces/swap-event.interface"
import { Swap, SwapStatus } from "../swap.entity"
import { SwapsService } from "../swaps.service"

export class EthBaseSwapsProcessor {
	protected static readonly erc20TokenContractAbi = [
		"function transfer(address to, uint amount) returns (bool)",
		"event Transfer(address indexed from, address indexed to, uint amount)",
	]

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
			return BigNumber.from(cachedGasPrice)
		}

		const gasPrice = await this.infuraProvider.getGasPrice()
		this.cacheManager.set(cacheKey, gasPrice.toHexString(), { ttl: ETH_CACHE_TTL })
		return gasPrice
	}

	protected async checkBlock(blockNumber: number): Promise<BlockWithTransactions> {
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

	protected recalculateSwap(swap: Swap, sourceAmount: string): Swap | undefined {
		const { destinationAmount, fee } = this.swapsService.calculateSwapAmounts(
			sourceAmount,
			swap.sourceToken,
			swap.destinationToken,
		)
		if (BigNumber.from(destinationAmount).lte(0) || BigNumber.from(fee).lte(0)) {
			return
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
