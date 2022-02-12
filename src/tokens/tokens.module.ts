import { Module } from "@nestjs/common"
import { ScheduleModule } from "@nestjs/schedule"
import { TypeOrmModule } from "@nestjs/typeorm"
import { Token } from "./token.entity"
import { TokensController } from "./tokens.controller"
import { TokensService } from "./tokens.service"
import { TokensTask } from "./tokens.task"
import { ExchangeRatesModule } from "../exchange-rates/exchange-rates.module"

@Module({
	imports: [TypeOrmModule.forFeature([Token]), ScheduleModule.forRoot(), ExchangeRatesModule],
	controllers: [TokensController],
	providers: [TokensService, TokensTask],
	exports: [TokensService],
})
export class TokensModule {}
