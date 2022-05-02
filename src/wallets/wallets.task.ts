import { Injectable, Logger } from "@nestjs/common"
import { Cron, CronExpression } from "@nestjs/schedule"
import BigNumber from "bignumber.js"
import { Blockchain } from "src/common/enums/blockchain.enum"
import { EthereumConractProvider } from "src/ethereum/ethereum-contract.provider"
import { TonContractProvider } from "src/ton/ton-contract.provider"
import { WalletsService } from "./wallets.service"

@Injectable()
export class WalletsTask {
	private readonly logger = new Logger(WalletsTask.name)

	constructor(
		private readonly ethereumContract: EthereumConractProvider,
		private readonly tonContract: TonContractProvider,
		private readonly walletsService: WalletsService,
	) {}

	@Cron(CronExpression.EVERY_30_MINUTES)
	async synchronizeEthWalletsBalance(): Promise<void> {
		try {
			const wallets = await this.walletsService.findAll(Blockchain.Ethereum)
			if (!wallets.length) {
				return
			}

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
					balance: balance.toFixed(wallet.token.decimals),
				})
			}
		} catch (err: unknown) {
			this.logger.error(
				`Unable to synchronize wallet balances in ${Blockchain.Ethereum}: ${err}`,
			)
		}
	}

	@Cron(CronExpression.EVERY_30_MINUTES)
	async synchronizeTonWalletsBalance(): Promise<void> {
		try {
			const wallets = await this.walletsService.findAll(Blockchain.TON)
			if (!wallets.length) {
				return
			}

			for (const wallet of wallets) {
				if (!wallet.conjugatedAddress) {
					continue
				}

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
			}
		} catch (err: unknown) {
			this.logger.error(`Unable to synchronize wallet balances in ${Blockchain.TON}: ${err}`)
		}
	}
}
