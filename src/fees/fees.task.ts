import { Injectable, Logger } from "@nestjs/common"
import { Cron, CronExpression } from "@nestjs/schedule"
import { InfuraProvider, InjectEthersProvider } from "nestjs-ethers"
import { Blockchain } from "./fee.entity"
import { FeesService } from "./fees.service"

@Injectable()
export class FeesTask {
	private readonly logger = new Logger(FeesTask.name)

	constructor(
		@InjectEthersProvider()
		private readonly infuraProvider: InfuraProvider,
		private readonly feesService: FeesService,
	) {}

	@Cron(CronExpression.EVERY_30_SECONDS)
	async synchronizeFees(): Promise<void> {
		const feeData = await this.infuraProvider.getFeeData()

		await this.feesService.update({
			blockchain: Blockchain.Ethereum,
			maxFeePerGas: feeData.maxFeePerGas.toString(),
			maxPriorityFeePerGas: feeData.maxPriorityFeePerGas.toString(),
			gasPrice: feeData.gasPrice.toString(),
		})
		this.logger.log(`${Blockchain.Ethereum} fees updated successfully`)
	}
}
