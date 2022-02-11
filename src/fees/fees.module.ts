import { Module } from "@nestjs/common"
import { ConfigModule } from "@nestjs/config"
import { ScheduleModule } from "@nestjs/schedule"
import { TypeOrmModule } from "@nestjs/typeorm"
import { Fee } from "./fee.entity"
import { FeesController } from "./fees.controller"
import { FeesService } from "./fees.service"
import { FeesTask } from "./fees.task"

@Module({
	imports: [ConfigModule, TypeOrmModule.forFeature([Fee]), ScheduleModule.forRoot()],
	controllers: [FeesController],
	providers: [FeesService, FeesTask],
})
export class FeesModule {}
