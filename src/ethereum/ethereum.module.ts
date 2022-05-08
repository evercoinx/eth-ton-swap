import { Module } from "@nestjs/common"
import { ConfigModule, ConfigService } from "@nestjs/config"
import { EthersModule, MAINNET_NETWORK, RINKEBY_NETWORK } from "nestjs-ethers"
import { Environment } from "src/common/enums/environment.enum"
import { TokensModule } from "src/tokens/tokens.module"
import { WalletsModule } from "src/wallets/wallets.module"
import { EthereumBlockchainService } from "./providers/ethereum-blockchain.service"
import { EthereumConractService } from "./providers/ethereum-contract.service"
import { EthereumController } from "./ethereum.controller"

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
					network: envToNetwork[config.get("environment")],
					infura: {
						projectId: config.get("infura.projectId"),
						projectSecret: config.get("infura.projectSecret"),
					},
					etherscan: config.get("etherscan.apiKey"),
					useDefaultProvider: false,
				}
			},
		}),
		TokensModule,
		WalletsModule,
	],
	controllers: [EthereumController],
	providers: [EthereumBlockchainService, EthereumConractService],
	exports: [EthereumBlockchainService, EthereumConractService],
})
export class EthereumModule {}
