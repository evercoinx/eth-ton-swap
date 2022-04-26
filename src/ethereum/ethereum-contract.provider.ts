import { Injectable } from "@nestjs/common"
import BigNumber from "bignumber.js"
import {
	BigNumber as BN,
	Contract,
	EthersContract,
	EthersSigner,
	formatUnits,
	hexlify,
	InjectContractProvider,
	InjectSignerProvider,
	Interface,
	Log,
	parseUnits,
	Transaction,
} from "nestjs-ethers"
import { ERC20_TOKEN_CONTRACT_ABI, ERC20_TOKEN_TRANSFER_GAS_LIMIT } from "./constants"
import { TransferLog } from "./interfaces/transfer-log.interface"
import { WalletSigner } from "./interfaces/wallet-signer.interface"

@Injectable()
export class EthereumConractProvider {
	private readonly contractInterface = new Interface(ERC20_TOKEN_CONTRACT_ABI)

	constructor(
		@InjectSignerProvider() private readonly signer: EthersSigner,
		@InjectContractProvider() private readonly contract: EthersContract,
	) {}

	async createRandomWalletSigner(): Promise<WalletSigner> {
		const wallet = this.signer.createRandomWallet()
		return {
			wallet,
			secretKey: wallet.privateKey.replace(/^0x/, ""),
			mnemonic: wallet.mnemonic?.phrase.split(" "),
		}
	}

	createTokenContract(tokenAddress: string, secretKey: string): Contract {
		const walletSigner = this.signer.createWallet(`0x${secretKey}`)
		return this.contract.create(`0x${tokenAddress}`, ERC20_TOKEN_CONTRACT_ABI, walletSigner)
	}

	matchTransferLog(
		log: Log,
		accountAddress: string,
		tokenDecimals: number,
	): TransferLog | undefined {
		const logDescription = this.contractInterface.parseLog(log)
		if (!logDescription || logDescription.args.length !== 3) {
			return
		}

		const [from, to, amount] = logDescription.args as [string, string, BN]
		if (to !== `0x${accountAddress}`) {
			return
		}

		return {
			sourceAddress: from,
			destinationAddress: to,
			amount: new BigNumber(formatUnits(amount, tokenDecimals)),
		}
	}

	async transferTokens(
		contract: Contract,
		destinationAccountAddress: string,
		tokenAmount: BigNumber,
		tokenDecimals: number,
		gasPrice: BigNumber,
	): Promise<string | undefined> {
		const tokenAmountWei = parseUnits(tokenAmount.toString(), tokenDecimals)
		const transaction: Transaction = await contract.transfer(
			`0x${destinationAccountAddress}`,
			tokenAmountWei,
			{
				gasPrice: hexlify(gasPrice.toNumber()),
				gasLimit: hexlify(ERC20_TOKEN_TRANSFER_GAS_LIMIT),
			},
		)
		return transaction?.hash.replace(/^0x/, "")
	}

	async getTokenBalance(
		contract: Contract,
		accountAddress: string,
		tokenDecimals: number,
	): Promise<BigNumber> {
		const balanceWei: BN = await contract.balanceOf(`0x${accountAddress}`)
		return new BigNumber(formatUnits(balanceWei, tokenDecimals))
	}
}
