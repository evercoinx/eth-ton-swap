import { Injectable, Logger } from "@nestjs/common"
import { Cron, CronExpression } from "@nestjs/schedule"
import BigNumber from "bignumber.js"
import { Blockchain } from "src/common/enums/blockchain.enum"
import { sleep } from "src/common/utils"
import { EthereumConractProvider } from "src/ethereum/ethereum-contract.provider"
import { TonContractProvider } from "src/ton/ton-contract.provider"
import { WalletsService } from "../wallets.service"

@Injectable()
export class WalletsTokenBalanceTask {
	private readonly logger = new Logger(WalletsTokenBalanceTask.name)

	constructor(
		private readonly ethereumContract: EthereumConractProvider,
		private readonly tonContract: TonContractProvider,
		private readonly walletsService: WalletsService,
	) {}

	@Cron(CronExpression.EVERY_2_HOURS)
	async synchronizeEthTokenBalance(): Promise<void> {
		try {
			const wallets = await this.walletsService.findAll(Blockchain.Ethereum)
			if (!wallets.length) {
				return
			}

			for (const wallet of wallets) {
				this.logger.debug(
					`${wallet.id}: Start synchronizing wallet token balance in ${Blockchain.Ethereum}`,
				)

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
					balance: balance.toFixed(wallet.token.decimals),
				})
				this.logger.debug(
					`${wallet.id}: Wallet token balance synchronized with ${balance.toFixed(
						wallet.token.decimals,
					)} ${wallet.token.symbol}`,
				)

				await sleep(1000)
			}

			this.logger.debug(
				`Finished to synchronize wallet token balances in ${Blockchain.Ethereum}`,
			)
		} catch (err: unknown) {
			this.logger.error(
				`Unable to synchronize wallet's token balance in ${Blockchain.Ethereum}: ${err}`,
			)
		}
	}

	@Cron(CronExpression.EVERY_2_HOURS)
	async synchronizeTonTokenBalance(): Promise<void> {
		try {
			const wallets = await this.walletsService.findAll(Blockchain.TON)
			if (!wallets.length) {
				return
			}

			for (const wallet of wallets) {
				if (!wallet.conjugatedAddress) {
					continue
				}
				this.logger.debug(
					`${wallet.id}: Start synchronizing wallet token balance in ${Blockchain.TON}`,
				)

				let balance = new BigNumber(0)
				try {
					const data = await this.tonContract.getJettonWalletData(
						wallet.conjugatedAddress,
					)
					balance = data.balance
				} catch (err: unknown) {}

				await this.walletsService.update(wallet.id, {
					balance: balance.toFixed(wallet.token.decimals),
				})
				this.logger.debug(
					`${wallet.id}: Wallet token balance synchronized with ${balance.toFixed(
						wallet.token.decimals,
					)} ${wallet.token.symbol}`,
				)

				await sleep(1000)
			}

			this.logger.debug(`Finished to synchronize wallet token balances in ${Blockchain.TON}`)
		} catch (err: unknown) {
			this.logger.error(
				`Unable to synchronize wallet token balance in ${Blockchain.TON}: ${err}`,
			)
		}
	}
}
