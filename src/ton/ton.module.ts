import { Module } from "@nestjs/common"
import { ConfigModule, ConfigService } from "@nestjs/config"
import { Environment } from "src/config/configuration"
import { TON_CONNECTION } from "./constants"
import { TonBlockchainProvider } from "./ton-blockchain.provider"
import { TonContractProvider } from "./ton-contract.provider"

@Module({
	imports: [ConfigModule],
	providers: [
		{
			provide: TON_CONNECTION,
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
		},
		TonBlockchainProvider,
		TonContractProvider,
	],
	exports: [TonBlockchainProvider, TonContractProvider],
})
export class TonModule {}
