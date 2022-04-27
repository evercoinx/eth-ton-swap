import { CacheModule, Module } from "@nestjs/common"
import { ConfigModule } from "@nestjs/config"
import { ScheduleModule } from "@nestjs/schedule"
import { TypeOrmModule } from "@nestjs/typeorm"
import { EthereumModule } from "src/ethereum/ethereum.module"
import { TokensModule } from "src/tokens/tokens.module"
import { Setting } from "./setting.entity"
import { SettingsService } from "./settings.service"
import { SettingsTask } from "./settings.task"
import { SettingsController } from "./settings.controller"

@Module({
	imports: [
		ConfigModule,
		TypeOrmModule.forFeature([Setting]),
		CacheModule.register({
			ttl: 1800,
			max: 5,
		}),
		ScheduleModule.forRoot(),
		EthereumModule,
		TokensModule,
	],
	controllers: [SettingsController],
	providers: [SettingsService, SettingsTask],
})
export class SettingsModule {}
