import { Injectable } from "@nestjs/common"
import BigNumber from "bignumber.js"
import {
	BigNumberish,
	formatEther,
	getAddress,
	InfuraProvider,
	InjectEthersProvider,
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

	private formatEther(amount: BigNumberish): BigNumber {
		return new BigNumber(formatEther(amount))
	}
}
