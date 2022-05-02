import { Injectable, Logger } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { Cron, CronExpression } from "@nestjs/schedule"
import BigNumber from "bignumber.js"
import { Blockchain } from "src/common/enums/blockchain.enum"
import { sleep } from "src/common/utils"
import { EthereumBlockchainProvider } from "src/ethereum/ethereum-blockchain.provider"
import { EthereumConractProvider } from "src/ethereum/ethereum-contract.provider"
import { WalletType } from "../enums/wallet-type.enum"
import { WalletsService } from "../wallets.service"

@Injectable()
export class WalletsBalanceTask {
	private readonly logger = new Logger(WalletsBalanceTask.name)

	constructor(
		private readonly configService: ConfigService,
		private readonly ethereumBlockchain: EthereumBlockchainProvider,
		private readonly ethereumContract: EthereumConractProvider,
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

			const minCurrencyBalance = this.configService.get<BigNumber>(
				"bridge.walletMinCurrencyBalance",
			)

			for (const wallet of wallets) {
				const balance = await this.ethereumBlockchain.getBalance(wallet.address)

				if (balance.lt(minCurrencyBalance)) {
					const giverWalletSigner = this.ethereumContract.createWalletSigner(
						giverWallet.secretKey,
					)
					await this.ethereumContract.transferEthers(
						giverWalletSigner,
						wallet.address,
						minCurrencyBalance.minus(balance),
					)
				}
				await sleep(2000)
			}
		} catch (err: unknown) {
			this.logger.error(
				`Unable to synchronize wallet balance in ${Blockchain.Ethereum}: ${err}`,
			)
		}
	}
}
