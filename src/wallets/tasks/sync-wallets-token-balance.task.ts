import { Injectable, Logger } from "@nestjs/common"
import { Cron, CronExpression } from "@nestjs/schedule"
import BigNumber from "bignumber.js"
import { Blockchain } from "src/common/enums/blockchain.enum"
import { StandardHelper } from "src/common/providers/standard.helper"
import { EthereumConractService } from "src/ethereum/providers/ethereum-contract.service"
import { TonContractService } from "src/ton/providers/ton-contract.service"
import { WalletsRepository } from "../providers/wallets.repository"

@Injectable()
export class SyncWalletsTokenBalanceTask {
	private readonly logger = new Logger(SyncWalletsTokenBalanceTask.name)

	constructor(
		private readonly walletsRepository: WalletsRepository,
		private readonly ethereumContractService: EthereumConractService,
		private readonly tonContractService: TonContractService,
		private readonly standardService: StandardHelper,
	) {}

	@Cron(CronExpression.EVERY_HOUR)
	async runEthereum(delay = 1000): Promise<void> {
		try {
			const wallets = await this.walletsRepository.findAll({
				blockchain: Blockchain.Ethereum,
				inUse: false,
				disabled: false,
			})
			if (!wallets.length) {
				this.logger.debug(`No ${Blockchain.Ethereum} wallets found`)
				return
			}

			for (const wallet of wallets) {
				this.logger.debug(
					`${wallet.id}: Start syncing wallet token balance in ${Blockchain.Ethereum}`,
				)

				const tokenContract = await this.ethereumContractService.createTokenContract(
					wallet.token.address,
					wallet.secretKey,
				)

				const balance = await this.ethereumContractService.getTokenBalance(
					tokenContract,
					wallet.address,
					wallet.token.decimals,
				)

				await this.walletsRepository.update(wallet.id, {
					balance: balance.toFixed(wallet.token.decimals),
				})
				this.logger.debug(
					`${wallet.id}: Wallet token balance synced with ${balance.toFixed(
						wallet.token.decimals,
					)} ${wallet.token.symbol}`,
				)

				await this.standardService.sleep(delay)
			}

			this.logger.debug(`Finished to sync wallet token balances in ${Blockchain.Ethereum}`)
		} catch (err: unknown) {
			this.logger.error(
				`Unable to sync wallet token balance in ${Blockchain.Ethereum}: ${err}`,
			)
		}
	}

	@Cron(CronExpression.EVERY_HOUR)
	async runTon(delay = 1000): Promise<void> {
		try {
			const wallets = await this.walletsRepository.findAll({
				blockchain: Blockchain.TON,
				disabled: false,
			})
			if (!wallets.length) {
				this.logger.debug(`No ${Blockchain.TON} wallets found`)
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
					const data = await this.tonContractService.getJettonWalletData(
						wallet.conjugatedAddress,
					)
					balance = data.balance
				} catch (err: unknown) {}

				await this.walletsRepository.update(wallet.id, {
					balance: balance.toFixed(wallet.token.decimals),
				})
				this.logger.debug(
					`${wallet.id}: Wallet token balance synced with ${balance.toFixed(
						wallet.token.decimals,
					)} ${wallet.token.symbol}`,
				)

				await this.standardService.sleep(delay)
			}

			this.logger.debug(`Finished to sync wallet token balances in ${Blockchain.TON}`)
		} catch (err: unknown) {
			this.logger.error(`Unable to sync wallet token balance in ${Blockchain.TON}: ${err}`)
		}
	}
}
