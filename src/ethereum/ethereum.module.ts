import { Module } from "@nestjs/common"
import { ConfigModule, ConfigService } from "@nestjs/config"
import { EthersModule, MAINNET_NETWORK, ROPSTEN_NETWORK } from "nestjs-ethers"
import { Environment } from "src/config/configuration"
import { TokensModule } from "src/tokens/tokens.module"
import { WalletsModule } from "src/wallets/wallets.module"
import { EthereumBlockchainProvider } from "./ethereum-blockchain.provider"
import { EthereumConractProvider } from "./ethereum-contract.provider"
import { EthereumController } from "./ethereum.controller"

@Module({
	imports: [
		EthersModule.forRootAsync({
			imports: [ConfigModule],
			inject: [ConfigService],
			useFactory: (config: ConfigService) => {
				const envToNetwork = {
					[Environment.Development]: ROPSTEN_NETWORK,
					[Environment.Staging]: ROPSTEN_NETWORK,
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
	providers: [EthereumBlockchainProvider, EthereumConractProvider],
	exports: [EthereumBlockchainProvider, EthereumConractProvider],
})
export class EthereumModule {}
