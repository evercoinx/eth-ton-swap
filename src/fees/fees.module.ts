import { Module } from "@nestjs/common"
import { ScheduleModule } from "@nestjs/schedule"
import { TypeOrmModule } from "@nestjs/typeorm"
import { EthereumModule } from "src/ethereum/ethereum.module"
import { Fee } from "./fee.entity"
import { FeesService } from "./fees.service"
import { FeesTask } from "./fees.task"

@Module({
	imports: [TypeOrmModule.forFeature([Fee]), ScheduleModule.forRoot(), EthereumModule],
	providers: [FeesService, FeesTask],
})
export class FeesModule {}
