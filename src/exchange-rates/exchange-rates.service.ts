import { HttpService } from "@nestjs/axios"
import { Injectable } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { AxiosResponse } from "axios"
import { firstValueFrom, throwError } from "rxjs"
import { catchError, map } from "rxjs/operators"

enum Token {
	Toncoin = "Toncoin",
	USDC = "USDC",
}

interface PriceConversionResponse {
	status: {
		error_code: string
		error_message: string
	}
	data: {
		quote: Array<{
			price: number
		}>
	}
}

@Injectable()
export class ExchangeRatesService {
	private readonly coinmarketcapEndpoint = "https://api.coinmarketcap.com"

	constructor(private configSerivce: ConfigService, private httpService: HttpService) {}

	async getQuotePrice(baseToken: Token, quoteToken: Token): Promise<number> {
		const tokenToCmcId = {
			[Token.Toncoin]: 11419,
			[Token.USDC]: 3408,
		}

		const url = new URL(
			`${this.coinmarketcapEndpoint}/data-api/v3/tools/price-conversion?amount=1&id=${tokenToCmcId[baseToken]}&convert_id=${tokenToCmcId[quoteToken]}`,
		)

		const source$ = this.httpService
			.get(url.href, {
				headers: {
					"X-CMC_PRO_API_KEY": this.configSerivce.get("coinmarketcap.apiKey"),
				},
			})
			.pipe(
				map((response: AxiosResponse<PriceConversionResponse>) =>
					response.data.status.error_code === "0" && response.data.data.quote.length
						? response.data.data.quote[0].price
						: 0,
				),
				catchError((err: unknown) => {
					return throwError(() => err)
				}),
			)

		return await firstValueFrom(source$)
	}
}
