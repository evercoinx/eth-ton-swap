import { HttpService } from "@nestjs/axios"
import { Injectable } from "@nestjs/common"
import { AxiosResponse } from "axios"
import { firstValueFrom } from "rxjs"
import { map } from "rxjs/operators"
import { PriceConversion } from "../interfaces/price-conversion.interface"

@Injectable()
export class ExchangeRatesService {
	constructor(private readonly httpService: HttpService) {}

	async getQuotePrice(baseId: number, quoteId: number): Promise<number> {
		const url = new URL(
			`https://api.coinmarketcap.com/data-api/v3/tools/price-conversion?amount=1&id=${baseId}&convert_id=${quoteId}`,
		)

		const price$ = this.httpService.get(url.href).pipe(
			map((response: AxiosResponse<PriceConversion>) => {
				const { data } = response
				if (data.status.error_code !== "0" || !data.data.quote.length) {
					throw new Error(
						`Code: ${data.status.error_code}. Message: ${data.status.error_message}`,
					)
				}
				return data.data.quote[0].price
			}),
		)

		return await firstValueFrom(price$)
	}
}
