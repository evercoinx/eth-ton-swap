import { Injectable, Logger } from "@nestjs/common"
import { Cron, CronExpression } from "@nestjs/schedule"
import { COINMARKETCAP_ID_USD } from "../constants"
import { ExchangeRatesService } from "../providers/exchange-rates.service"
import { TokensRepository } from "../providers/tokens.repository"

@Injectable()
export class SyncTokensPriceTask {
	private readonly logger = new Logger(SyncTokensPriceTask.name)

	constructor(
		private readonly tokensRepository: TokensRepository,
		private readonly exchangeRatesService: ExchangeRatesService,
	) {}

	@Cron(CronExpression.EVERY_DAY_AT_4AM)
	async run(): Promise<void> {
		try {
			const tokens = await this.tokensRepository.findAll()
			if (!tokens.length) {
				return
			}

			for (const token of tokens) {
				if (!token.coinmarketcapId) {
					continue
				}

				this.logger.debug(`${token.id}: Start syncing token price`)
				const quotePrice = await this.exchangeRatesService.getQuotePrice(
					token.coinmarketcapId,
					COINMARKETCAP_ID_USD,
				)

				await this.tokensRepository.update(token.id, { price: quotePrice })
				this.logger.debug(`${token.id}: Token price synced with ${quotePrice} USD`)
			}

			this.logger.debug("Finished to sync token prices")
		} catch (err: unknown) {
			this.logger.error(`Unable to sync token price: ${err}`)
		}
	}
}
