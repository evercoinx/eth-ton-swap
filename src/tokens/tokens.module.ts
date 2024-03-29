import { HttpModule } from "@nestjs/axios"
import { CacheModule, forwardRef, Module } from "@nestjs/common"
import { ConfigModule, ConfigService } from "@nestjs/config"
import { ScheduleModule } from "@nestjs/schedule"
import { TypeOrmModule } from "@nestjs/typeorm"
import { EthereumModule } from "src/ethereum/ethereum.module"
import { TonModule } from "src/ton/ton.module"
import { TasksController } from "./controllers/tasks.controller"
import { TokensController } from "./controllers/tokens.controller"
import { ExchangeRatesService } from "./providers/exchange-rates.service"
import { TokensRepository } from "./providers/tokens.repository"
import { SyncTokensPriceTask } from "./tasks/sync-tokens-price.task"
import { Token } from "./token.entity"

@Module({
	imports: [
		ConfigModule,
		TypeOrmModule.forFeature([Token]),
		ScheduleModule.forRoot(),
		CacheModule.register({
			ttl: 86400,
			max: 5,
		}),
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
		forwardRef(() => EthereumModule),
		TonModule,
	],
	controllers: [TokensController, TasksController],
	providers: [TokensRepository, ExchangeRatesService, SyncTokensPriceTask],
	exports: [TokensRepository],
})
export class TokensModule {}
