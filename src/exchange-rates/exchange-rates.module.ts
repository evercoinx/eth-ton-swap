import { HttpModule } from "@nestjs/axios"
import { ConfigModule } from "@nestjs/config"
import { Module } from "@nestjs/common"
import { ExchangeRatesService } from "./exchange-rates.service"

@Module({
	imports: [ConfigModule, HttpModule],
	providers: [ExchangeRatesService],
	exports: [ExchangeRatesService],
})
export class ExchangeRatesModule {}
