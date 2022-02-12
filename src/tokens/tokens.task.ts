import { Injectable, Logger } from "@nestjs/common"
import { Cron, CronExpression } from "@nestjs/schedule"
import { TokensService } from "./tokens.service"
import { ExchangeRatesService } from "../exchange-rates/exchange-rates.service"

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

		for (const token of tokens) {
			const quotePrice = await this.exchangeRatesService.getQuotePrice(
				token.coinmarketcapId,
				COINMARKETCAP_ID_USD,
			)
			if (!quotePrice) {
				this.logger.error(`Unable to update price quote for token ${token.name}`)
				continue
			}

			this.tokensService.update({
				id: token.id,
				price: quotePrice,
			})
		}

		this.logger.log(`Price quotes for ${tokens.length} tokens updated successfully`)
	}
}
