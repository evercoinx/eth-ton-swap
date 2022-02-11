import { Module } from "@nestjs/common"
import { ConfigModule } from "@nestjs/config"
import { FeesController } from "./fees.controller"
import { FeesService } from "./fees.service"

@Module({
	imports: [ConfigModule],
	controllers: [FeesController],
	providers: [FeesService],
})
export class FeesModule {}
