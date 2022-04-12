import { Injectable } from "@nestjs/common"
import BigNumber from "bignumber.js"
import {
	BigNumberish,
	BlockWithTransactions,
	formatEther,
	getAddress,
	id,
	InfuraProvider,
	InjectEthersProvider,
	Log,
} from "nestjs-ethers"
import { Block } from "./interfaces/block.interface"
import { FeeData } from "./interfaces/fee-data.interface"

@Injectable()
export class EthereumBlockchainProvider {
	constructor(@InjectEthersProvider() private readonly infuraProvider: InfuraProvider) {}

	normalizeAddress(address: string): string {
		return getAddress(address).replace(/^0x/, "")
	}

	async getLatestBlock(): Promise<Block> {
		const { number } = await this.infuraProvider.getBlock("latest")
		return {
			number,
		}
	}

	async getFeeData(): Promise<FeeData> {
		const feeData = await this.infuraProvider.getFeeData()
		return {
			maxFeePerGas: this.formatEther(feeData.maxFeePerGas),
			maxPriorityFeePerGas: this.formatEther(feeData.maxPriorityFeePerGas),
			gasPrice: this.formatEther(feeData.gasPrice),
		}
	}

	async getGasPrice(): Promise<BigNumber> {
		const gasPrice = await this.infuraProvider.getGasPrice()
		return new BigNumber(gasPrice.toString())
	}

	async getBlockWithTransactions(blockNumber: number): Promise<BlockWithTransactions> {
		return await this.infuraProvider.getBlockWithTransactions(blockNumber)
	}

	async getLogs(tokenAddress: string, blockNumber: number): Promise<Log[]> {
		return await this.infuraProvider.getLogs({
			address: tokenAddress,
			topics: [id("Transfer(address,address,uint256)")],
			fromBlock: blockNumber,
			toBlock: blockNumber,
		})
	}

	private formatEther(amount: BigNumberish): BigNumber {
		return new BigNumber(formatEther(amount))
	}
}
