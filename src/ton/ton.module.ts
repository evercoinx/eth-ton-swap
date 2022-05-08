import { forwardRef, Module } from "@nestjs/common"
import { ConfigModule, ConfigService } from "@nestjs/config"
import { Environment } from "src/common/enums/environment.enum"
import { TokensModule } from "src/tokens/tokens.module"
import { WalletsModule } from "src/wallets/wallets.module"
import { TON_CONNECTION_TOKEN } from "./constants"
import { TonBlockchainService } from "./providers/ton-blockchain.service"
import { TonContractService } from "./providers/ton-contract.service"
import { TonController } from "./ton.controller"

@Module({
	imports: [ConfigModule, forwardRef(() => TokensModule), WalletsModule],
	controllers: [TonController],
	providers: [
		{
			provide: TON_CONNECTION_TOKEN,
			inject: [ConfigService],
			useFactory: async (configService: ConfigService) => ({
				apiKey: configService.get("toncenter.apiKey"),
				blockchainId:
					configService.get("environment") === Environment.Production
						? "mainnet"
						: "testnet",
				workchain: 0,
				walletVersion: "v3R2",
				jettonContentUri: configService.get("bridge.jettonContentUri"),
			}),
		},
		TonBlockchainService,
		TonContractService,
	],
	exports: [TonBlockchainService, TonContractService],
})
export class TonModule {}
