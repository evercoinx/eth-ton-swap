import { CACHE_MANAGER, Inject } from "@nestjs/common"
import BigNumber from "bignumber.js"
import { Cache } from "cache-manager"
import { BlockWithTransactions } from "nestjs-ethers"
import { EventsService } from "src/common/events.service"
import { EthereumBlockchainProvider } from "src/ethereum/ethereum-blockchain.provider"
import { WalletsService } from "src/wallets/wallets.service"
import { ETH_CACHE_TTL, TOTAL_CONFIRMATIONS } from "../constants"
import { SwapEvent } from "../interfaces/swap-event.interface"
import { Swap, SwapStatus } from "../swap.entity"
import { SwapsService } from "../swaps.service"

export class EthBaseSwapsProcessor {
	constructor(
		@Inject(CACHE_MANAGER) protected readonly cacheManager: Cache,
		protected readonly cacheKeyPrefix: string,
		protected readonly ethereumBlockchain: EthereumBlockchainProvider,
		protected readonly swapsService: SwapsService,
		protected readonly eventsService: EventsService,
		protected readonly walletsService: WalletsService,
	) {}

	protected async getGasPrice(): Promise<BigNumber> {
		const cacheKey = this.cacheKeyPrefix + "gas_price"
		const cachedGasPrice = await this.cacheManager.get<string>(cacheKey)
		if (cachedGasPrice) {
			return new BigNumber(cachedGasPrice)
		}

		const gasPrice = await this.ethereumBlockchain.getGasPrice()
		this.cacheManager.set(cacheKey, gasPrice.toString(), { ttl: ETH_CACHE_TTL })
		return gasPrice
	}

	protected async getBlockWithTransactions(blockNumber?: number): Promise<BlockWithTransactions> {
		const cacheKey = this.cacheKeyPrefix + blockNumber.toString()
		let block = await this.cacheManager.get<BlockWithTransactions>(cacheKey)
		if (!block) {
			block = await this.ethereumBlockchain.getBlockWithTransactions(blockNumber)
			if (!block) {
				throw new Error("Block not found")
			}
			this.cacheManager.set(cacheKey, block, { ttl: ETH_CACHE_TTL })
		}
		return block
	}

	protected recalculateSwap(swap: Swap, sourceAmount: BigNumber): Swap {
		const [destinationAmount, fee] =
			this.swapsService.calculateDestinationAmountAndFee(sourceAmount)

		if (new BigNumber(destinationAmount).lte(0)) {
			throw new Error("Destination amount below zero")
		}

		if (new BigNumber(fee).lte(0)) {
			throw new Error("Fee below zero")
		}

		swap.sourceAmount = sourceAmount.toFixed(swap.sourceToken.decimals)
		swap.destinationAmount = destinationAmount.toFixed(swap.destinationToken.decimals)
		swap.fee = fee.toFixed(swap.sourceToken.decimals)
		return swap
	}

	protected emitEvent(swapId: string, status: SwapStatus, currentConfirmations: number): void {
		this.eventsService.emit({
			id: swapId,
			status,
			currentConfirmations,
			totalConfirmations: TOTAL_CONFIRMATIONS,
			createdAt: Date.now(),
		} as SwapEvent)
	}

	protected isSwapProcessable(status: SwapStatus): boolean {
		return ![SwapStatus.Failed, SwapStatus.Expired, SwapStatus.Canceled].includes(status)
	}
}
