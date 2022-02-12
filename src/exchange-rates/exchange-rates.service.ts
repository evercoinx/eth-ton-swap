import { HttpService } from "@nestjs/axios"
import { Injectable, Logger } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { AxiosResponse } from "axios"
import { firstValueFrom } from "rxjs"
import { map } from "rxjs/operators"
import { PriceConversion } from "./interfaces/price-conversion.interface"

enum Token {
	Toncoin = "Toncoin",
	USDC = "USDC",
}

@Injectable()
export class ExchangeRatesService {
	private readonly logger = new Logger(ExchangeRatesService.name)
	private readonly coinmarketcapEndpoint = "https://api.coinmarketcap.com"

	constructor(private configSerivce: ConfigService, private httpService: HttpService) {}

	async getQuotePrice(base: Token, quote: Token): Promise<number | undefined> {
		const tokenToCmcId = {
			[Token.Toncoin]: 11419,
			[Token.USDC]: 3408,
		}

		const url = new URL(
			`${this.coinmarketcapEndpoint}/data-api/v3/tools/price-conversion?amount=1&id=${tokenToCmcId[base]}&convert_id=${tokenToCmcId[quote]}`,
		)

		const price$ = this.httpService
			.get(url.href, {
				headers: {
					"X-CMC_PRO_API_KEY": this.configSerivce.get("coinmarketcap.apiKey"),
				},
			})
			.pipe(
				map((response: AxiosResponse<PriceConversion>) => {
					const { data } = response
					if (data.status.error_code !== "0" || !data.data.quote.length) {
						this.logger.error(
							`Code: ${data.status.error_code}. Message: ${data.status.error_message}`,
						)
						return
					}
					return data.data.quote[0].price
				}),
			)

		return await firstValueFrom(price$)
	}
}
