import { HttpModule } from "@nestjs/axios"
import { ConfigModule, ConfigService } from "@nestjs/config"
import { Module } from "@nestjs/common"
import { ExchangeRatesService } from "./exchange-rates.service"

@Module({
	imports: [
		HttpModule.registerAsync({
			imports: [ConfigModule],
			inject: [ConfigService],
			useFactory: (configService: ConfigService) => ({
				headers: {
					"X-CMC_PRO_API_KEY": configService.get("coinmarketcap.apiKey"),
				},
				timeout: 5000,
				maxRedirects: 1,
			}),
		}),
	],
	providers: [ExchangeRatesService],
	exports: [ExchangeRatesService],
})
export class ExchangeRatesModule {}
