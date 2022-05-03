import { CacheModule, forwardRef, Module } from "@nestjs/common"
import { ConfigModule } from "@nestjs/config"
import { ScheduleModule } from "@nestjs/schedule"
import { TypeOrmModule } from "@nestjs/typeorm"
import { EthereumModule } from "src/ethereum/ethereum.module"
import { TokensModule } from "src/tokens/tokens.module"
import { SyncSettingsGasFeeTask } from "./tasks/sync-settings-gas-fee.task"
import { SettingsController } from "./settings.controller"
import { Setting } from "./setting.entity"
import { SettingsService } from "./settings.service"

@Module({
	imports: [
		ConfigModule,
		TypeOrmModule.forFeature([Setting]),
		CacheModule.register({
			ttl: 1800,
			max: 5,
		}),
		ScheduleModule.forRoot(),
		forwardRef(() => EthereumModule),
		forwardRef(() => TokensModule),
	],
	controllers: [SettingsController],
	providers: [SettingsService, SyncSettingsGasFeeTask],
	exports: [SettingsService],
})
export class SettingsModule {}
