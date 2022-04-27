import { Injectable, Logger } from "@nestjs/common"
import { Cron, CronExpression } from "@nestjs/schedule"
import { EthereumBlockchainProvider } from "src/ethereum/ethereum-blockchain.provider"
import { Blockchain } from "src/tokens/token.entity"
import { SettingsService } from "./settings.service"

@Injectable()
export class SettingsTask {
	private readonly logger = new Logger(SettingsTask.name)

	constructor(
		private readonly settingsService: SettingsService,
		private readonly ethereumBlockchain: EthereumBlockchainProvider,
	) {}

	@Cron(CronExpression.EVERY_2_HOURS)
	async synchronizeEthereumSetting(): Promise<void> {
		try {
			const settings = await this.settingsService.findOne(Blockchain.Ethereum)
			if (!settings) {
				return
			}

			const feeData = await this.ethereumBlockchain.getFeeData()
			const gasFee = this.ethereumBlockchain.calculateTokenGasFee(feeData.maxFeePerGas)

			await this.settingsService.update(settings.id, {
				gasFee: gasFee.toFixed(settings.currencyDecimals),
			})
			this.logger.log(`Setting for ${Blockchain.Ethereum} synchronized`)
		} catch (err: unknown) {
			this.logger.error(`Unable to synchronize setting for ${Blockchain.Ethereum}: ${err}`)
		}
	}
}
