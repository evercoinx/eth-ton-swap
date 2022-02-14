import { Injectable, Logger } from "@nestjs/common"
import { Cron, CronExpression } from "@nestjs/schedule"
import { ExchangeRatesService } from "src/exchange-rates/exchange-rates.service"
import { TokensService } from "./tokens.service"

const COINMARKETCAP_ID_USD = 2781

@Injectable()
export class TokensTask {
	private readonly logger = new Logger(TokensTask.name)

	constructor(
		private readonly tokensService: TokensService,
		private readonly exchangeRatesService: ExchangeRatesService,
	) {}

	@Cron(CronExpression.EVERY_30_SECONDS)
	async synchronizePriceQuotes(): Promise<void> {
		const tokens = await this.tokensService.findAll()
		let updatedCount = 0

		for (const token of tokens) {
			const quotePrice = await this.exchangeRatesService.getQuotePrice(
				token.coinmarketcapId,
				COINMARKETCAP_ID_USD,
			)
			if (!quotePrice) {
				this.logger.error(`Unable to update token ${token.name} with quote price`)
				continue
			}

			await this.tokensService.update({
				id: token.id,
				price: quotePrice,
			})
			updatedCount++
		}

		this.logger.log(`Quote prices for ${updatedCount} tokens were updated successfully`)
	}
}
