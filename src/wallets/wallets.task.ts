import { Injectable, Logger } from "@nestjs/common"
import { Cron, CronExpression } from "@nestjs/schedule"
import {
	BigNumber as BN,
	EthersContract,
	EthersSigner,
	formatUnits,
	InjectContractProvider,
	InjectSignerProvider,
} from "nestjs-ethers"
import { ERC20_TOKEN_CONTRACT_ABI } from "src/common/constants"
import { Blockchain } from "src/tokens/token.entity"
import { TonBlockchainProvider } from "src/ton/ton-blockchain.provider"
import { WalletType } from "./wallet.entity"
import { WalletsService } from "./wallets.service"

@Injectable()
export class WalletsTask {
	private readonly logger = new Logger(WalletsTask.name)

	constructor(
		@InjectSignerProvider() private readonly signer: EthersSigner,
		@InjectContractProvider() private readonly contract: EthersContract,
		private readonly tonBlockchain: TonBlockchainProvider,
		private readonly walletsService: WalletsService,
	) {}

	@Cron(CronExpression.EVERY_DAY_AT_4AM)
	async synchronizeEthWalletsBalance(): Promise<void> {
		const wallets = await this.walletsService.findAll(Blockchain.Ethereum, WalletType.Transfer)
		if (!wallets.length) {
			return
		}

		let updatedWalletCount = 0
		for (const wallet of wallets) {
			const walletSigner = this.signer.createWallet(`0x${wallet.secretKey}`)
			const contract = this.contract.create(
				`0x${wallet.token.address}`,
				ERC20_TOKEN_CONTRACT_ABI,
				walletSigner,
			)

			const balance: BN = await contract.balanceOf(wallet.address)
			await this.walletsService.update({
				id: wallet.id,
				balance: formatUnits(balance, wallet.token.decimals),
			})
			updatedWalletCount++
		}

		this.logger.log(
			`Balance of ${updatedWalletCount} wallets in ${Blockchain.Ethereum} updated`,
		)
	}

	@Cron(CronExpression.EVERY_DAY_AT_5AM)
	async synchronizeTonWalletsBalance(): Promise<void> {
		const wallets = await this.walletsService.findAll(Blockchain.TON, WalletType.Transfer)
		if (!wallets.length) {
			return
		}

		let updatedWalletCount = 0
		for (const wallet of wallets) {
			const balance = await this.tonBlockchain.getBalance(wallet.address)
			await this.walletsService.update({
				id: wallet.id,
				balance: balance.toString(),
			})
			updatedWalletCount++
		}

		this.logger.log(`Balance of ${updatedWalletCount} wallets in ${Blockchain.TON} updated`)
	}
}
