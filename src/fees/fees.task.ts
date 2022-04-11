import { Injectable, Logger } from "@nestjs/common"
import { Cron, CronExpression } from "@nestjs/schedule"
import { EthereumBlockchainProvider } from "src/ethereum/ethereum-blockchain.provider"
import { Blockchain } from "src/tokens/token.entity"
import { FeesService } from "./fees.service"

@Injectable()
export class FeesTask {
	private readonly logger = new Logger(FeesTask.name)

	constructor(
		private readonly feesService: FeesService,
		private readonly ethereumBlockchain: EthereumBlockchainProvider,
	) {}

	@Cron(CronExpression.EVERY_6_HOURS)
	async synchronizeEthFees(): Promise<void> {
		try {
			const feeData = await this.ethereumBlockchain.getFeeData()

			await this.feesService.upsert({
				blockchain: Blockchain.Ethereum,
				maxFeePerGas: feeData.maxFeePerGas.toString(),
			})
			this.logger.log("Ethereum fees updated")
		} catch (err: unknown) {
			this.logger.error("Unable to get fee data")
		}
	}
}
