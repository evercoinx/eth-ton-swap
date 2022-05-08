import { Injectable, Logger } from "@nestjs/common"
import { Cron, CronExpression } from "@nestjs/schedule"
import BigNumber from "bignumber.js"
import { Blockchain } from "src/common/enums/blockchain.enum"
import { sleep } from "src/common/utils"
import { EthereumBlockchainService } from "src/ethereum/providers/ethereum-blockchain.service"
import { EthereumConractService } from "src/ethereum/providers/ethereum-contract.service"
import { SettingsService } from "src/settings/providers/settings.service"
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
		private readonly settingsService: SettingsService,
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
				return
			}

			const giverWallets = await this.walletsRepository.findAll(
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
			const wallets = await this.walletsRepository.findAll(
				Blockchain.TON,
				WalletType.Transfer,
			)
			if (!wallets.length) {
				return
			}

			const giverWallets = await this.walletsRepository.findAll(
				Blockchain.TON,
				WalletType.Giver,
			)
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
