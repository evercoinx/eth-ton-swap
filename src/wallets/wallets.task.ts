import { Injectable, Logger } from "@nestjs/common"
import { Cron, CronExpression } from "@nestjs/schedule"
import BigNumber from "bignumber.js"
import { EthereumConractProvider } from "src/ethereum/ethereum-contract.provider"
import { Blockchain } from "src/tokens/token.entity"
import { TonContractProvider } from "src/ton/ton-contract.provider"
import { WalletType } from "./wallet.entity"
import { WalletsService } from "./wallets.service"

@Injectable()
export class WalletsTask {
	private readonly logger = new Logger(WalletsTask.name)

	constructor(
		private readonly ethereumContract: EthereumConractProvider,
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
				this.logger.warn(
					`No wallet balances to synchronize in ${Blockchain.Ethereum} found`,
				)
				return
			}

			let updatedWalletCount = 0
			for (const wallet of wallets) {
				const tokenContract = this.ethereumContract.createTokenContract(
					wallet.token.address,
					wallet.secretKey,
				)

				const balance = await this.ethereumContract.getTokenBalance(
					tokenContract,
					wallet.address,
					wallet.token.decimals,
				)

				await this.walletsService.update(wallet.id, {
					balance: balance.toFixed(wallet.token.decimals, BigNumber.ROUND_DOWN),
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
				await this.walletsService.update(wallet.id, {
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
