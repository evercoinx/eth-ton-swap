import { Module } from "@nestjs/common"
import { ConfigModule, ConfigService } from "@nestjs/config"
import { EthersModule, MAINNET_NETWORK, ROPSTEN_NETWORK } from "nestjs-ethers"
import { Environment } from "src/config/configuration"
import { EthereumBlockchainProvider } from "./ethereum-blockchain.provider"
import { EthereumConractProvider } from "./ethereum-contract.provider"

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
	],
	providers: [EthereumBlockchainProvider, EthereumConractProvider],
	exports: [EthereumBlockchainProvider, EthereumConractProvider],
})
export class EthereumModule {}
