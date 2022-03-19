import { CacheModule, Module } from "@nestjs/common"
import { ScheduleModule } from "@nestjs/schedule"
import { TypeOrmModule } from "@nestjs/typeorm"
import { ExchangeRatesModule } from "src/exchange-rates/exchange-rates.module"
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
	],
	controllers: [TokensController],
	providers: [TokensService, TokensTask],
	exports: [TokensService],
})
export class TokensModule {}
