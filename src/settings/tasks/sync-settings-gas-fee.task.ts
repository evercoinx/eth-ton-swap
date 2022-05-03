import { Injectable, Logger } from "@nestjs/common"
import { Cron, CronExpression } from "@nestjs/schedule"
import { Blockchain } from "src/common/enums/blockchain.enum"
import { EthereumBlockchainProvider } from "src/ethereum/ethereum-blockchain.provider"
import { SettingsService } from "../settings.service"

@Injectable()
export class SyncSettingsGasFeeTask {
	private readonly logger = new Logger(SyncSettingsGasFeeTask.name)

	constructor(
		private readonly settingsService: SettingsService,
		private readonly ethereumBlockchain: EthereumBlockchainProvider,
	) {}

	@Cron(CronExpression.EVERY_HOUR)
	async runEthereum(): Promise<void> {
		try {
			const settings = await this.settingsService.findOne(Blockchain.Ethereum)
			if (!settings) {
				return
			}

			this.logger.debug(`Start syncing gas fee in ${Blockchain.Ethereum}`)
			const feeData = await this.ethereumBlockchain.getFeeData()

			const gasFee = this.ethereumBlockchain.calculateTokenGasFee(feeData.maxFeePerGas)
			await this.settingsService.update(settings.id, {
				gasFee: gasFee.toFixed(settings.decimals),
			})

			this.logger.debug(`Gas fee synced in ${Blockchain.Ethereum}`)
		} catch (err: unknown) {
			this.logger.error(`Unable to sync gas fee in ${Blockchain.Ethereum}: ${err}`)
		}
	}
}
