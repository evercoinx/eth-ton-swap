import { CacheModule, forwardRef, Module } from "@nestjs/common"
import { ConfigModule } from "@nestjs/config"
import { ScheduleModule } from "@nestjs/schedule"
import { TypeOrmModule } from "@nestjs/typeorm"
import { EthereumModule } from "src/ethereum/ethereum.module"
import { TokensModule } from "src/tokens/tokens.module"
import { SettingsRepository } from "./providers/settings.repository"
import { SettingsController } from "./settings.controller"
import { Setting } from "./setting.entity"
import { SyncSettingsGasFeeTask } from "./tasks/sync-settings-gas-fee.task"

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
	providers: [SettingsRepository, SyncSettingsGasFeeTask],
	exports: [SettingsRepository],
})
export class SettingsModule {}
