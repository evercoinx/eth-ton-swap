import { CacheModule, Module } from "@nestjs/common"
import { ConfigModule } from "@nestjs/config"
import { TypeOrmModule } from "@nestjs/typeorm"
import { Fee } from "src/fees/fee.entity"
import { FeesService } from "src/fees/fees.service"
import { SettingsController } from "./settings.controller"

@Module({
	imports: [
		ConfigModule,
		TypeOrmModule.forFeature([Fee]),
		CacheModule.register({
			ttl: 3600,
			max: 5,
		}),
	],
	controllers: [SettingsController],
	providers: [FeesService],
})
export class SettingsModule {}
