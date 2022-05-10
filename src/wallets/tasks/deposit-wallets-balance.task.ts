import { Injectable, Logger } from "@nestjs/common"
import { Cron, CronExpression } from "@nestjs/schedule"
import BigNumber from "bignumber.js"
import { Blockchain } from "src/common/enums/blockchain.enum"
import { StdlibHelper } from "src/common/providers/stdlib.helper"
import { EthereumBlockchainService } from "src/ethereum/providers/ethereum-blockchain.service"
import { EthereumConractService } from "src/ethereum/providers/ethereum-contract.service"
import { SettingsRepository } from "src/settings/providers/settings.repository"
import { TonBlockchainService } from "src/ton/providers/ton-blockchain.service"
import { TonContractService } from "src/ton/providers/ton-contract.service"
import { WalletType } from "../enums/wallet-type.enum"
import { WalletsRepository } from "../providers/wallets.repository"
import { Wallet } from "../wallet.entity"

@Injectable()
export class DepositWalletsBalanceTask {
	private readonly logger = new Logger(DepositWalletsBalanceTask.name)

	constructor(
		private readonly ethereumBlockchain: EthereumBlockchainService,
		private readonly ethereumContract: EthereumConractService,
		private readonly tonBlockchain: TonBlockchainService,
		private readonly tonContract: TonContractService,
		private readonly stdlib: StdlibHelper,
		private readonly settingsRepository: SettingsRepository,
		private readonly walletsRepository: WalletsRepository,
	) {}

	@Cron(CronExpression.EVERY_HOUR)
	async runEthereum(delay = 100): Promise<void> {
		try {
			const wallets = await this.walletsRepository.findAll(
				Blockchain.Ethereum,
				WalletType.Transfer,
			)
			if (!wallets.length) {
				this.logger.debug(`No ${Blockchain.Ethereum} ${WalletType.Transfer} wallets found`)
				return
			}

			const giverWallets = await this.walletsRepository.findAll(
				Blockchain.Ethereum,
				WalletType.Giver,
			)
			if (!giverWallets.length) {
				return
			}

			const setting = await this.settingsRepository.findOne(Blockchain.Ethereum)
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
					const giverWalletSigner = await this.ethereumContract.createWalletSigner(
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

				await this.stdlib.sleep(delay)
			}

			this.logger.debug(`Finished to deposit wallets balance in ${Blockchain.Ethereum}`)
		} catch (err: unknown) {
			this.logger.error(`Unable to deposit wallets balance in ${Blockchain.Ethereum}: ${err}`)
		}
	}

	@Cron(CronExpression.EVERY_HOUR)
	async runTon(delay = 100): Promise<void> {
		try {
			const wallets = await this.walletsRepository.findAll(
				Blockchain.TON,
				WalletType.Transfer,
			)
			if (!wallets.length) {
				this.logger.debug(`No ${Blockchain.TON} ${WalletType.Transfer} wallets found`)
				return
			}

			const giverWallets = await this.walletsRepository.findAll(
				Blockchain.TON,
				WalletType.Giver,
			)
			if (!giverWallets.length) {
				this.logger.debug(`No ${Blockchain.TON} ${WalletType.Giver} wallets found`)
				return
			}

			const setting = await this.settingsRepository.findOne(Blockchain.TON)
			if (!setting) {
				this.logger.debug(`${Blockchain.TON} setting found`)
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
					const giverWalletSigner = await this.tonContract.createWalletSigner(
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

				await this.stdlib.sleep(delay)
			}

			this.logger.debug(`Finished to deposit wallets balance in ${Blockchain.TON}`)
		} catch (err: unknown) {
			this.logger.error(`Unable to deposit wallets balance in ${Blockchain.TON}: ${err}`)
		}
	}
}
