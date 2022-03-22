import { Module } from "@nestjs/common"
import { ConfigModule, ConfigService } from "@nestjs/config"
import { ScheduleModule } from "@nestjs/schedule"
import { TypeOrmModule } from "@nestjs/typeorm"
import { Environment } from "src/config/configuration"
import { TokensModule } from "src/tokens/tokens.module"
import { TonModule } from "src/ton/ton.module"
import { Wallet } from "./wallet.entity"
import { WalletsController } from "./wallets.controller"
import { WalletsService } from "./wallets.service"
import { WalletsTask } from "./wallets.task"

@Module({
	imports: [
		ConfigModule,
		TypeOrmModule.forFeature([Wallet]),
		ScheduleModule.forRoot(),
		TonModule.registerAsync({
			imports: [ConfigModule],
			useFactory: async (configService: ConfigService) => ({
				apiKey: configService.get("toncenter.apiKey"),
				blockchainId:
					configService.get("environment") === Environment.Production
						? "mainnet"
						: "testnet",
				workchain: 0,
				walletVersion: "v3R2",
			}),
			inject: [ConfigService],
		}),
		TokensModule,
	],
	controllers: [WalletsController],
	providers: [WalletsService, WalletsTask],
	exports: [WalletsService],
})
export class WalletsModule {}
