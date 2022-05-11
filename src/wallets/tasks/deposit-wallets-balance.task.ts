import { Injectable, Logger } from "@nestjs/common"
import { Cron, CronExpression } from "@nestjs/schedule"
import BigNumber from "bignumber.js"
import { Blockchain } from "src/common/enums/blockchain.enum"
import { StandardHelper } from "src/common/providers/standard.helper"
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
		private readonly walletsRepository: WalletsRepository,
		private readonly settingsRepository: SettingsRepository,
		private readonly ethereumBlockchainService: EthereumBlockchainService,
		private readonly ethereumContractService: EthereumConractService,
		private readonly tonBlockchainService: TonBlockchainService,
		private readonly tonContractService: TonContractService,
		private readonly standardService: StandardHelper,
	) {}

	@Cron(CronExpression.EVERY_HOUR)
	async runEthereum(delay = 1000): Promise<void> {
		try {
			const wallets = await this.walletsRepository.findAll({
				blockchain: Blockchain.Ethereum,
				type: WalletType.Transfer,
				disabled: false,
			})
			if (!wallets.length) {
				this.logger.debug(
					`No ${WalletType.Transfer} wallets found in ${Blockchain.Ethereum}`,
				)
				return
			}

			const giverWallets = await this.walletsRepository.findAll({
				blockchain: Blockchain.Ethereum,
				type: WalletType.Giver,
				disabled: false,
			})
			if (!giverWallets.length) {
				this.logger.warn(`No ${WalletType.Giver} wallets found in ${Blockchain.Ethereum}`)
				return
			}

			const setting = await this.settingsRepository.findOne({
				blockchain: Blockchain.Ethereum,
			})
			if (!setting) {
				this.logger.warn(`${Blockchain.Ethereum} setting not found`)
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
				const balance = await this.ethereumBlockchainService.getBalance(wallet.address)

				if (balance.plus(balanceEpsilon).lt(minWalletBalance)) {
					const giverWallet = giverWallets.pop()
					const giverWalletSigner = await this.ethereumContractService.createWalletSigner(
						giverWallet.secretKey,
					)
					const amount = minWalletBalance.minus(balance)

					await this.ethereumContractService.transferEthers(
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

				await this.standardService.sleep(delay)
			}

			this.logger.debug(`Finished to deposit wallets balance in ${Blockchain.Ethereum}`)
		} catch (err: unknown) {
			this.logger.error(`Unable to deposit wallets balance in ${Blockchain.Ethereum}: ${err}`)
		}
	}

	@Cron(CronExpression.EVERY_HOUR)
	async runTon(delay = 1000): Promise<void> {
		try {
			const wallets = await this.walletsRepository.findAll({
				blockchain: Blockchain.TON,
				type: WalletType.Transfer,
				disabled: false,
				hasConjugatedAddress: true,
			})
			if (!wallets.length) {
				this.logger.debug(`No ${Blockchain.TON} ${WalletType.Transfer} wallets found`)
				return
			}

			const giverWallets = await this.walletsRepository.findAll({
				blockchain: Blockchain.TON,
				type: WalletType.Giver,
				disabled: false,
			})
			if (!giverWallets.length) {
				this.logger.warn(`No ${Blockchain.TON} ${WalletType.Giver} wallets found`)
				return
			}

			const setting = await this.settingsRepository.findOne({
				blockchain: Blockchain.TON,
			})
			if (!setting) {
				this.logger.warn(`${Blockchain.TON} setting not found`)
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
				const balance = await this.tonBlockchainService.getBalance(wallet.address)

				if (balance.plus(balanceEpsilon).lt(minWalletBalance)) {
					const giverWallet = giverWallets.pop()
					const giverWalletSigner = await this.tonContractService.createWalletSigner(
						giverWallet.secretKey,
					)

					const amount = minWalletBalance.minus(balance)
					await this.tonContractService.transfer(
						giverWalletSigner,
						wallet.address,
						amount,
						true,
					)

					this.logger.debug(
						`${wallet.id}: Wallet balance deposited with ${amount.toFixed(
							setting.decimals,
						)} TON`,
					)
				}

				await this.standardService.sleep(delay)
			}

			this.logger.debug(`Finished to deposit wallets balance in ${Blockchain.TON}`)
		} catch (err: unknown) {
			this.logger.error(`Unable to deposit wallets balance in ${Blockchain.TON}: ${err}`)
		}
	}
}
