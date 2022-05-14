import { forwardRef, Module } from "@nestjs/common"
import { ConfigModule, ConfigService } from "@nestjs/config"
import { CommonModule } from "src/common/common.module"
import { Environment } from "src/common/enums/environment.enum"
import { TokensModule } from "src/tokens/tokens.module"
import { WalletsModule } from "src/wallets/wallets.module"
import { TON_CONNECTION } from "./constants"
import { MintersController } from "./controllers/minters.controller"
import { WalletsController } from "./controllers/wallets.controller"
import { TonBlockchainService } from "./providers/ton-blockchain.service"
import { TonContractService } from "./providers/ton-contract.service"

@Module({
	imports: [ConfigModule, forwardRef(() => TokensModule), CommonModule, WalletsModule],
	controllers: [MintersController, WalletsController],
	providers: [
		{
			provide: TON_CONNECTION,
			inject: [ConfigService],
			useFactory: async (configService: ConfigService) => ({
				apiKey: configService.get<string>("toncenter.apiKey"),
				blockchainId:
					configService.get<Environment>("environment") === Environment.Production
						? "mainnet"
						: "testnet",
				workchain: 0,
				walletVersion: "v3R2",
				jettonContentUri: configService.get<URL>("bridge.jettonContentUri"),
			}),
		},
		TonBlockchainService,
		TonContractService,
	],
	exports: [TonBlockchainService, TonContractService],
})
export class TonModule {}
