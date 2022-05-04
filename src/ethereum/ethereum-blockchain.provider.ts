import { Injectable } from "@nestjs/common"
import BigNumber from "bignumber.js"
import {
	Block,
	BlockWithTransactions,
	formatEther,
	getAddress,
	id,
	InfuraProvider,
	InjectEthersProvider,
	Log,
	TransactionReceipt,
} from "nestjs-ethers"
import { ERC20_TOKEN_TRANSFER_GAS_LIMIT } from "./constants"
import { FeeData } from "./interfaces/fee-data.interface"

@Injectable()
export class EthereumBlockchainProvider {
	constructor(@InjectEthersProvider() private readonly infuraProvider: InfuraProvider) {}

	normalizeAddress(address: string): string {
		return getAddress(address).replace(/^0x/, "")
	}

	calculateTokenGasFee(maxFeePerGas: BigNumber): BigNumber {
		return new BigNumber(maxFeePerGas).times(ERC20_TOKEN_TRANSFER_GAS_LIMIT)
	}

	async getFeeData(): Promise<FeeData> {
		const feeData = await this.infuraProvider.getFeeData()
		return {
			maxFeePerGas: new BigNumber(formatEther(feeData.maxFeePerGas)),
			maxPriorityFeePerGas: new BigNumber(formatEther(feeData.maxPriorityFeePerGas)),
			gasPrice: new BigNumber(formatEther(feeData.gasPrice)),
		}
	}

	async getGasPrice(): Promise<BigNumber> {
		const gasPrice = await this.infuraProvider.getGasPrice()
		return new BigNumber(gasPrice.toString())
	}

	async getBlock(blockNumber?: number): Promise<Block> {
		return await this.infuraProvider.getBlock(
			blockNumber === undefined ? "latest" : blockNumber,
		)
	}

	async getBlockWithTransactions(blockNumber?: number): Promise<BlockWithTransactions> {
		return await this.infuraProvider.getBlockWithTransactions(
			blockNumber === undefined ? "latest" : blockNumber,
		)
	}

	async getLogs(tokenAddress: string, fromBlock: number, toBlock: number): Promise<Log[]> {
		return await this.infuraProvider.getLogs({
			address: tokenAddress,
			topics: [id("Transfer(address,address,uint256)")],
			fromBlock,
			toBlock,
		})
	}

	async getBalance(address: string): Promise<BigNumber> {
		const balance = await this.infuraProvider.getBalance(address)
		return new BigNumber(formatEther(balance))
	}

	async waitForTransaction(
		transactionId: string,
		confirmations: number,
	): Promise<TransactionReceipt> {
		return await this.infuraProvider.waitForTransaction(
			`0x${transactionId}`,
			confirmations < 0 ? 0 : confirmations,
			0,
		)
	}
}
