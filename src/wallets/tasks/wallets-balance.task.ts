import { Injectable, Logger } from "@nestjs/common"
import { Cron, CronExpression } from "@nestjs/schedule"
import BigNumber from "bignumber.js"
import { Blockchain } from "src/common/enums/blockchain.enum"
import { sleep } from "src/common/utils"
import { EthereumBlockchainProvider } from "src/ethereum/ethereum-blockchain.provider"
import { EthereumConractProvider } from "src/ethereum/ethereum-contract.provider"
import { SettingsService } from "src/settings/settings.service"
import { TonBlockchainProvider } from "src/ton/ton-blockchain.provider"
import { TonContractProvider } from "src/ton/ton-contract.provider"
import { WalletType } from "../enums/wallet-type.enum"
import { WalletsService } from "../wallets.service"

@Injectable()
export class WalletsBalanceTask {
	private readonly logger = new Logger(WalletsBalanceTask.name)

	constructor(
		private readonly ethereumBlockchain: EthereumBlockchainProvider,
		private readonly ethereumContract: EthereumConractProvider,
		private readonly tonBlockchain: TonBlockchainProvider,
		private readonly tonContract: TonContractProvider,
		private readonly settingsService: SettingsService,
		private readonly walletsService: WalletsService,
	) {}

	@Cron(CronExpression.EVERY_2_HOURS)
	async synchronizeEthBalance(): Promise<void> {
		try {
			const wallets = await this.walletsService.findAll(
				Blockchain.Ethereum,
				WalletType.Transfer,
			)
			if (!wallets.length) {
				return
			}

			const giverWallet = await this.walletsService.findRandomOne(
				Blockchain.Ethereum,
				WalletType.Giver,
			)
			if (!giverWallet) {
				return
			}

			const setting = await this.settingsService.findOne(Blockchain.Ethereum)
			if (!setting) {
				return
			}

			const minWalletBalance = new BigNumber(setting.minWalletBalance)
			for (const wallet of wallets) {
				this.logger.debug(
					`${wallet.id}: Start synchronizing wallet balance in ${Blockchain.Ethereum}`,
				)
				const balance = await this.ethereumBlockchain.getBalance(wallet.address)

				if (balance.lt(minWalletBalance)) {
					const giverWalletSigner = this.ethereumContract.createWalletSigner(
						giverWallet.secretKey,
					)
					const amount = minWalletBalance.minus(balance)

					await this.ethereumContract.transferEthers(
						giverWalletSigner,
						wallet.address,
						amount,
					)
					this.logger.debug(
						`${wallet.id}: Wallet balance synchronized with ${amount.toFixed(
							setting.decimals,
						)} ETH`,
					)
				}
				await sleep(1000)
			}

			this.logger.debug(`Finished to synchronize wallet balances in ${Blockchain.Ethereum}`)
		} catch (err: unknown) {
			this.logger.error(
				`Unable to synchronize wallet balance in ${Blockchain.Ethereum}: ${err}`,
			)
		}
	}

	@Cron(CronExpression.EVERY_2_HOURS)
	async synchronizeTonBalance(): Promise<void> {
		try {
			const wallets = await this.walletsService.findAll(Blockchain.TON, WalletType.Transfer)
			if (!wallets.length) {
				return
			}

			const giverWallet = await this.walletsService.findRandomOne(
				Blockchain.TON,
				WalletType.Giver,
			)
			if (!giverWallet) {
				return
			}

			const setting = await this.settingsService.findOne(Blockchain.Ethereum)
			if (!setting) {
				return
			}

			const minWalletBalance = new BigNumber(setting.minWalletBalance)
			for (const wallet of wallets) {
				this.logger.debug(
					`${wallet.id}: Start synchronizing wallet balance in ${Blockchain.TON}`,
				)
				const balance = await this.tonBlockchain.getBalance(wallet.address)

				if (balance.lt(minWalletBalance)) {
					const giverWalletSigner = this.tonContract.createWalletSigner(
						giverWallet.secretKey,
					)
					const amount = minWalletBalance.minus(balance)

					await this.tonContract.transfer(giverWalletSigner, wallet.address, amount, true)

					this.logger.debug(
						`${wallet.id}: Wallet balance synchronized with ${amount.toFixed(
							setting.decimals,
						)} TON`,
					)
				}
				await sleep(1000)
			}

			this.logger.debug(`Finished to synchronize wallet balances in ${Blockchain.TON}`)
		} catch (err: unknown) {
			this.logger.error(`Unable to synchronize wallet balance in ${Blockchain.TON}: ${err}`)
		}
	}
}
