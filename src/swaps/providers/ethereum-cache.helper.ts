import { CACHE_MANAGER, Inject, Injectable } from "@nestjs/common"
import BigNumber from "bignumber.js"
import { Cache } from "cache-manager"
import { BlockWithTransactions } from "nestjs-ethers"
import { ETH_CACHE_TTL } from "src/ethereum/constants"
import { EthereumBlockchainService } from "src/ethereum/providers/ethereum-blockchain.service"

@Injectable()
export class EthereumCacheHelper {
	private readonly cacheKeyPrefix = "eth"

	constructor(
		@Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
		private readonly ethereumBlockchainService: EthereumBlockchainService,
	) {}

	async getGasPrice(): Promise<BigNumber> {
		const cacheKey = this.cacheKeyPrefix + "gas_price"
		const cachedGasPrice = await this.cacheManager.get<string>(cacheKey)
		if (cachedGasPrice) {
			return new BigNumber(cachedGasPrice)
		}

		const gasPrice = await this.ethereumBlockchainService.getGasPrice()
		this.cacheManager.set(cacheKey, gasPrice.toString(), { ttl: ETH_CACHE_TTL })
		return gasPrice
	}

	async getBlockWithTransactions(blockNumber?: number): Promise<BlockWithTransactions> {
		const cacheKey = this.cacheKeyPrefix + blockNumber.toString()
		let block = await this.cacheManager.get<BlockWithTransactions>(cacheKey)
		if (!block) {
			block = await this.ethereumBlockchainService.getBlockWithTransactions(blockNumber)
			if (!block) {
				throw new Error("Block not found")
			}
			this.cacheManager.set(cacheKey, block, { ttl: ETH_CACHE_TTL })
		}
		return block
	}
}
