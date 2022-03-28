import { Module } from "@nestjs/common"
import { ConfigModule, ConfigService } from "@nestjs/config"
import { TypeOrmModule } from "@nestjs/typeorm"
import { Environment } from "src/config/configuration"
import { TonModule } from "src/ton/ton.module"
import { Wallet } from "src/wallets/wallet.entity"
import { WalletsModule } from "src/wallets/wallets.module"
import { ContractsController } from "./contracts.controller"

@Module({
	imports: [
		ConfigModule,
		TypeOrmModule.forFeature([Wallet]),
		TonModule.registerAsync({
			imports: [ConfigModule],
			inject: [ConfigService],
			useFactory: async (configService: ConfigService) => ({
				apiKey: configService.get("toncenter.apiKey"),
				blockchainId:
					configService.get("environment") === Environment.Production
						? "mainnet"
						: "testnet",
				workchain: 0,
				walletVersion: "v3R2",
			}),
		}),
		WalletsModule,
	],
	controllers: [ContractsController],
})
export class ContractsModule {}
