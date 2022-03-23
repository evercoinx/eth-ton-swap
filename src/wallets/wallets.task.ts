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
import { TonService } from "src/ton/ton.service"
import { WalletType } from "./wallet.entity"
import { WalletsService } from "./wallets.service"

@Injectable()
export class WalletsTask {
	private readonly logger = new Logger(WalletsTask.name)

	constructor(
		@InjectSignerProvider() private readonly signer: EthersSigner,
		@InjectContractProvider() private readonly contract: EthersContract,
		private readonly tonService: TonService,
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

		this.logger.log(`Balance of ${updatedWalletCount} eth wallets updated successfully`)
	}

	@Cron(CronExpression.EVERY_DAY_AT_5AM)
	async synchronizeTonWalletsBalance(): Promise<void> {
		const wallets = await this.walletsService.findAll(Blockchain.TON, WalletType.Transfer)
		if (!wallets.length) {
			return
		}

		let updatedWalletCount = 0
		for (const wallet of wallets) {
			const balance = await this.tonService.getBalance(wallet.address)
			await this.walletsService.update({
				id: wallet.id,
				balance: balance.toString(),
			})
			updatedWalletCount++
		}

		this.logger.log(`Balance of ${updatedWalletCount} ton wallets updated successfully`)
	}
}
