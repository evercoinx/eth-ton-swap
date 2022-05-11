import { Injectable, Logger } from "@nestjs/common"
import { Cron, CronExpression } from "@nestjs/schedule"
import { Blockchain } from "src/common/enums/blockchain.enum"
import { EthereumBlockchainService } from "src/ethereum/providers/ethereum-blockchain.service"
import { SettingsRepository } from "../providers/settings.repository"

@Injectable()
export class SyncSettingsGasFeeTask {
	private readonly logger = new Logger(SyncSettingsGasFeeTask.name)

	constructor(
		private readonly settingsRepository: SettingsRepository,
		private readonly ethereumBlockchainService: EthereumBlockchainService,
	) {}

	@Cron(CronExpression.EVERY_HOUR)
	async runEthereum(): Promise<void> {
		try {
			const settings = await this.settingsRepository.findOne(Blockchain.Ethereum)
			if (!settings) {
				this.logger.debug(`${Blockchain.Ethereum} setting not found`)
				return
			}

			this.logger.debug(`Start syncing gas fee in ${Blockchain.Ethereum}`)
			const feeData = await this.ethereumBlockchainService.getFeeData()

			const gasFee = this.ethereumBlockchainService.calculateTokenGasFee(feeData.maxFeePerGas)
			await this.settingsRepository.update(settings.id, {
				gasFee: gasFee.toFixed(settings.decimals),
			})

			this.logger.debug(`Gas fee synced in ${Blockchain.Ethereum}`)
		} catch (err: unknown) {
			this.logger.error(`Unable to sync gas fee in ${Blockchain.Ethereum}: ${err}`)
		}
	}
}
