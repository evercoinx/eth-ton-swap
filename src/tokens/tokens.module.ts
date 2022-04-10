import { CacheModule, Module } from "@nestjs/common"
import { ConfigModule, ConfigService } from "@nestjs/config"
import { ScheduleModule } from "@nestjs/schedule"
import { TypeOrmModule } from "@nestjs/typeorm"
import { Environment } from "src/config/configuration"
import { ExchangeRatesModule } from "src/exchange-rates/exchange-rates.module"
import { TonModule } from "src/ton/ton.module"
import { Token } from "./token.entity"
import { TokensController } from "./tokens.controller"
import { TokensService } from "./tokens.service"
import { TokensTask } from "./tokens.task"

@Module({
	imports: [
		TypeOrmModule.forFeature([Token]),
		ScheduleModule.forRoot(),
		CacheModule.register({
			ttl: 86400,
			max: 5,
		}),
		ExchangeRatesModule,
		TonModule.registerAsync({
			imports: [ConfigModule],
			useFactory: async (configService: ConfigService) => ({
				apiKey: configService.get("toncenter.apiKey"),
				blockchainId:
					configService.get("environment") === Environment.Production
						? "mainnet"
						: "testnet",
				workchain: 0,
				walletVersion: "v3R2",
			}),
			inject: [ConfigService],
		}),
	],
	controllers: [TokensController],
	providers: [TokensService, TokensTask],
	exports: [TokensService],
})
export class TokensModule {}
