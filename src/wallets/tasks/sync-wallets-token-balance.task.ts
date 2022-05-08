import { Injectable, Logger } from "@nestjs/common"
import { Cron, CronExpression } from "@nestjs/schedule"
import BigNumber from "bignumber.js"
import { Blockchain } from "src/common/enums/blockchain.enum"
import { sleep } from "src/common/utils"
import { EthereumConractService } from "src/ethereum/providers/ethereum-contract.service"
import { TonContractService } from "src/ton/providers/ton-contract.service"
import { WalletsService } from "../providers/wallets.service"

@Injectable()
export class SyncWalletsTokenBalanceTask {
	private readonly logger = new Logger(SyncWalletsTokenBalanceTask.name)

	constructor(
		private readonly ethereumContract: EthereumConractService,
		private readonly tonContract: TonContractService,
		private readonly walletsService: WalletsService,
	) {}

	@Cron(CronExpression.EVERY_HOUR)
	async runEthereum(delay = 100): Promise<void> {
		try {
			const wallets = await this.walletsService.findAll(Blockchain.Ethereum)
			if (!wallets.length) {
				return
			}

			for (const wallet of wallets) {
				this.logger.debug(
					`${wallet.id}: Start syncing wallet token balance in ${Blockchain.Ethereum}`,
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
					`${wallet.id}: Wallet token balance synced with ${balance.toFixed(
						wallet.token.decimals,
					)} ${wallet.token.symbol}`,
				)

				await sleep(delay)
			}

			this.logger.debug(`Finished to sync wallet token balances in ${Blockchain.Ethereum}`)
		} catch (err: unknown) {
			this.logger.error(
				`Unable to sync wallet token balance in ${Blockchain.Ethereum}: ${err}`,
			)
		}
	}

	@Cron(CronExpression.EVERY_HOUR)
	async runTon(delay = 100): Promise<void> {
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
					`${wallet.id}: Start syncing wallet token balance in ${Blockchain.TON}`,
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
					`${wallet.id}: Wallet token balance synced with ${balance.toFixed(
						wallet.token.decimals,
					)} ${wallet.token.symbol}`,
				)

				await sleep(delay)
			}

			this.logger.debug(`Finished to sync wallet token balances in ${Blockchain.TON}`)
		} catch (err: unknown) {
			this.logger.error(`Unable to sync wallet token balance in ${Blockchain.TON}: ${err}`)
		}
	}
}
