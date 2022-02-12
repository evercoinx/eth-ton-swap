import { HttpService } from "@nestjs/axios"
import { Injectable, Logger } from "@nestjs/common"
import { AxiosResponse } from "axios"
import { firstValueFrom } from "rxjs"
import { map } from "rxjs/operators"
import { PriceConversion } from "./interfaces/price-conversion.interface"

enum Token {
	Toncoin = "Toncoin",
	USDC = "USDC",
}

const TOKEN_TO_CMCID = {
	[Token.Toncoin]: 11419,
	[Token.USDC]: 3408,
}

@Injectable()
export class ExchangeRatesService {
	private readonly logger = new Logger(ExchangeRatesService.name)
	private readonly coinmarketcapEndpoint = "https://api.coinmarketcap.com"

	constructor(private httpService: HttpService) {}

	async getQuotePrice(base: Token, quote: Token): Promise<number | undefined> {
		const url = new URL(
			`${this.coinmarketcapEndpoint}/data-api/v3/tools/price-conversion?amount=1&id=${TOKEN_TO_CMCID[base]}&convert_id=${TOKEN_TO_CMCID[quote]}`,
		)

		const price$ = this.httpService.get(url.href).pipe(
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
