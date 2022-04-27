import { CacheModule, Module } from "@nestjs/common"
import { ConfigModule } from "@nestjs/config"
import { TypeOrmModule } from "@nestjs/typeorm"
import { Fee } from "src/fees/fee.entity"
import { FeesModule } from "src/fees/fees.module"
import { FeesService } from "src/fees/fees.service"
import { TokensModule } from "src/tokens/tokens.module"
import { SettingsController } from "./settings.controller"

@Module({
	imports: [
		ConfigModule,
		TypeOrmModule.forFeature([Fee]),
		CacheModule.register({
			ttl: 5,
			max: 5,
		}),
		FeesModule,
		TokensModule,
	],
	controllers: [SettingsController],
	providers: [FeesService],
})
export class SettingsModule {}
