import { Module } from "@nestjs/common"
import { ConfigModule, ConfigService } from "@nestjs/config"
import { EthersModule, MAINNET_NETWORK, RINKEBY_NETWORK } from "nestjs-ethers"
import { CommonModule } from "src/common/common.module"
import { Environment } from "src/common/enums/environment.enum"
import { TokensModule } from "src/tokens/tokens.module"
import { WalletsModule } from "src/wallets/wallets.module"
import { WalletsController } from "./controllers/wallets.controller"
import { EthereumBlockchainService } from "./providers/ethereum-blockchain.service"
import { EthereumConractService } from "./providers/ethereum-contract.service"

@Module({
	imports: [
		EthersModule.forRootAsync({
			imports: [ConfigModule],
			inject: [ConfigService],
			useFactory: (config: ConfigService) => {
				const envToNetwork = {
					[Environment.Development]: RINKEBY_NETWORK,
					[Environment.Staging]: RINKEBY_NETWORK,
					[Environment.Production]: MAINNET_NETWORK,
				}

				return {
					network: envToNetwork[config.get<Environment>("environment")],
					infura: {
						projectId: config.get<string>("infura.projectId"),
						projectSecret: config.get<string>("infura.projectSecret"),
					},
					etherscan: config.get<string>("etherscan.apiKey"),
					useDefaultProvider: false,
				}
			},
		}),
		CommonModule,
		TokensModule,
		WalletsModule,
	],
	controllers: [WalletsController],
	providers: [EthereumBlockchainService, EthereumConractService],
	exports: [EthereumBlockchainService, EthereumConractService],
})
export class EthereumModule {}
