import { Injectable, Logger } from "@nestjs/common"
import { Cron, CronExpression } from "@nestjs/schedule"
import { InfuraProvider, InjectEthersProvider } from "nestjs-ethers"
import { Blockchain } from "src/tokens/token.entity"
import { FeesService } from "./fees.service"

@Injectable()
export class FeesTask {
	private readonly logger = new Logger(FeesTask.name)

	constructor(
		@InjectEthersProvider()
		private readonly infuraProvider: InfuraProvider,
		private readonly feesService: FeesService,
	) {}

	@Cron(CronExpression.EVERY_6_HOURS)
	async synchronizeFees(): Promise<void> {
		const feeData = await this.infuraProvider.getFeeData()
		if (!feeData.maxFeePerGas) {
			this.logger.log(`Unable to get fee data for ${Blockchain.Ethereum}`)
			return
		}

		await this.feesService.update({
			blockchain: Blockchain.Ethereum,
			maxFeePerGas: feeData.maxFeePerGas.toString(),
		})
		this.logger.log(`${Blockchain.Ethereum} fees updated successfully`)
	}
}
