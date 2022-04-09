import { Injectable, Logger } from "@nestjs/common"
import { Cron, CronExpression } from "@nestjs/schedule"
import BigNumber from "bignumber.js"
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
import { TonContractProvider } from "src/ton/ton-contract.provider"
import { WalletType } from "./wallet.entity"
import { WalletsService } from "./wallets.service"

@Injectable()
export class WalletsTask {
	private readonly logger = new Logger(WalletsTask.name)

	constructor(
		@InjectSignerProvider() private readonly ethersSigner: EthersSigner,
		@InjectContractProvider() private readonly ethersContract: EthersContract,
		private readonly tonContract: TonContractProvider,
		private readonly walletsService: WalletsService,
	) {}

	@Cron(CronExpression.EVERY_4_HOURS)
	async synchronizeEthWalletsBalance(): Promise<void> {
		try {
			const wallets = await this.walletsService.findAll(
				Blockchain.Ethereum,
				WalletType.Transfer,
			)
			if (!wallets.length) {
				this.logger.warn(`No wallet balances to synchronize in ${Blockchain.TON} found`)
				return
			}

			let updatedWalletCount = 0
			for (const wallet of wallets) {
				const walletSigner = this.ethersSigner.createWallet(`0x${wallet.secretKey}`)
				const contract = this.ethersContract.create(
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
				`${updatedWalletCount} wallet balances in ${Blockchain.Ethereum} synchronized`,
			)
		} catch (err: unknown) {
			this.logger.error(
				`Unable to synchronize wallet balances in ${Blockchain.Ethereum}: ${err}`,
			)
		}
	}

	@Cron(CronExpression.EVERY_4_HOURS)
	async synchronizeTonWalletsBalance(): Promise<void> {
		try {
			const wallets = await this.walletsService.findAll(Blockchain.TON, WalletType.Transfer)
			if (!wallets.length) {
				this.logger.warn(`No wallet balances to synchronize in ${Blockchain.TON} found`)
				return
			}

			let updatedWalletCount = 0
			for (const wallet of wallets) {
				if (!wallet.conjugatedAddress) {
					continue
				}

				const walletSigner = this.tonContract.createVoidWalletSigner(
					wallet.conjugatedAddress,
				)
				const { balance } = await this.tonContract.getJettonWalletData(walletSigner)
				await this.walletsService.update({
					id: wallet.id,
					balance: balance.toFixed(wallet.token.decimals, BigNumber.ROUND_DOWN),
				})
				updatedWalletCount++
			}

			this.logger.log(
				`${updatedWalletCount} wallet balances in ${Blockchain.TON} synchronized`,
			)
		} catch (err: unknown) {
			this.logger.error(`Unable to synchronize wallet balances in ${Blockchain.TON}: ${err}`)
		}
	}
}
