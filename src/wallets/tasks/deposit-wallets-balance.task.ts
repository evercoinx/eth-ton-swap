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
import { Wallet } from "../wallet.entity"
import { WalletsService } from "../wallets.service"

@Injectable()
export class DepositWalletsBalanceTask {
	private readonly logger = new Logger(DepositWalletsBalanceTask.name)

	constructor(
		private readonly ethereumBlockchain: EthereumBlockchainProvider,
		private readonly ethereumContract: EthereumConractProvider,
		private readonly tonBlockchain: TonBlockchainProvider,
		private readonly tonContract: TonContractProvider,
		private readonly settingsService: SettingsService,
		private readonly walletsService: WalletsService,
	) {}

	@Cron(CronExpression.EVERY_HOUR)
	async runEthereum(delay = 100): Promise<void> {
		try {
			const wallets = await this.walletsService.findAll(
				Blockchain.Ethereum,
				WalletType.Transfer,
			)
			if (!wallets.length) {
				return
			}

			const giverWallets = await this.walletsService.findAll(
				Blockchain.Ethereum,
				WalletType.Giver,
			)
			if (!giverWallets.length) {
				return
			}

			const setting = await this.settingsService.findOne(Blockchain.Ethereum)
			if (!setting) {
				return
			}

			const minWalletBalance = new BigNumber(setting.minWalletBalance)
			const balanceEpsilon = minWalletBalance.div(10)

			wallets.sort((a: Wallet, b: Wallet) => new BigNumber(b.balance).comparedTo(a.balance))
			for (const wallet of wallets) {
				if (!giverWallets.length) {
					break
				}

				this.logger.debug(
					`${wallet.id}: Start depositing wallet balance in ${Blockchain.Ethereum}`,
				)
				const balance = await this.ethereumBlockchain.getBalance(wallet.address)

				if (balance.plus(balanceEpsilon).lt(minWalletBalance)) {
					const giverWallet = giverWallets.pop()
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
						`${wallet.id}: Wallet balance deposited with ${amount.toFixed(
							setting.decimals,
						)} ETH`,
					)
				}

				await sleep(delay)
			}

			this.logger.debug(`Finished to deposit wallets balance in ${Blockchain.Ethereum}`)
		} catch (err: unknown) {
			this.logger.error(`Unable to deposit wallets balance in ${Blockchain.Ethereum}: ${err}`)
		}
	}

	@Cron(CronExpression.EVERY_HOUR)
	async runTon(delay = 100): Promise<void> {
		try {
			const wallets = await this.walletsService.findAll(Blockchain.TON, WalletType.Transfer)
			if (!wallets.length) {
				return
			}

			const giverWallets = await this.walletsService.findAll(Blockchain.TON, WalletType.Giver)
			if (!giverWallets.length) {
				return
			}

			const setting = await this.settingsService.findOne(Blockchain.TON)
			if (!setting) {
				return
			}

			const minWalletBalance = new BigNumber(setting.minWalletBalance)
			const balanceEpsilon = minWalletBalance.div(10)

			wallets.sort((a: Wallet, b: Wallet) => new BigNumber(b.balance).comparedTo(a.balance))
			for (const wallet of wallets) {
				if (!giverWallets.length) {
					break
				}

				this.logger.debug(
					`${wallet.id}: Start depositing wallet balance in ${Blockchain.TON}`,
				)
				const balance = await this.tonBlockchain.getBalance(wallet.address)

				if (balance.plus(balanceEpsilon).lt(minWalletBalance)) {
					const giverWallet = giverWallets.pop()
					const giverWalletSigner = this.tonContract.createWalletSigner(
						giverWallet.secretKey,
					)
					const amount = minWalletBalance.minus(balance)

					await this.tonContract.transfer(giverWalletSigner, wallet.address, amount, true)

					this.logger.debug(
						`${wallet.id}: Wallet balance deposited with ${amount.toFixed(
							setting.decimals,
						)} TON`,
					)
				}

				await sleep(delay)
			}

			this.logger.debug(`Finished to deposit wallets balance in ${Blockchain.TON}`)
		} catch (err: unknown) {
			this.logger.error(`Unable to deposit wallets balance in ${Blockchain.TON}: ${err}`)
		}
	}
}