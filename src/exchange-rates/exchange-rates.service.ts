import { HttpService } from "@nestjs/axios"
import { Injectable, Logger } from "@nestjs/common"
import { AxiosResponse } from "axios"
import { firstValueFrom } from "rxjs"
import { map } from "rxjs/operators"
import { PriceConversion } from "./interfaces/price-conversion.interface"

@Injectable()
export class ExchangeRatesService {
	private static readonly coinmarketcapEndpoint = "https://api.coinmarketcap.com"
	private readonly logger = new Logger(ExchangeRatesService.name)

	constructor(private httpService: HttpService) {}

	async getQuotePrice(baseId: number, quoteId: number): Promise<number | undefined> {
		const url = new URL(
			`${ExchangeRatesService.coinmarketcapEndpoint}/data-api/v3/tools/price-conversion?amount=1&id=${baseId}&convert_id=${quoteId}`,
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
