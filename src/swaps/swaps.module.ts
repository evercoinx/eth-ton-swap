import { BullModule } from "@nestjs/bull"
import { CacheModule, Module } from "@nestjs/common"
import { ConfigModule, ConfigService } from "@nestjs/config"
import { TypeOrmModule } from "@nestjs/typeorm"
import { EVENT_GROUP_NAME } from "src/common/constants"
import { EventsService } from "src/common/events.service"
import { Environment } from "src/config/configuration"
import { TokensModule } from "src/tokens/tokens.module"
import { TonModule } from "src/ton/ton.module"
import { Wallet } from "src/wallets/wallet.entity"
import { WalletsModule } from "src/wallets/wallets.module"
import {
	ETH_DESTINATION_SWAPS_QUEUE,
	ETH_SOURCE_SWAPS_QUEUE,
	TON_DESTINATION_SWAPS_QUEUE,
	TON_SOURCE_SWAPS_QUEUE,
} from "./constants"
import { EthDestinationSwapsProcessor } from "./processors/eth-destination-swaps.processor"
import { EthSourceSwapsProcessor } from "./processors/eth-source-swaps.processor"
import { TonDestinationSwapsProcessor } from "./processors/ton-destination-swaps.processor"
import { TonSourceSwapsProcessor } from "./processors/ton-source-swaps.processor"
import { Swap } from "./swap.entity"
import { SwapsController } from "./swaps.controller"
import { SwapsService } from "./swaps.service"

@Module({
	imports: [
		ConfigModule,
		TypeOrmModule.forFeature([Swap, Wallet]),
		BullModule.registerQueue({
			name: ETH_SOURCE_SWAPS_QUEUE,
		}),
		BullModule.registerQueue({
			name: ETH_DESTINATION_SWAPS_QUEUE,
		}),
		BullModule.registerQueue({
			name: TON_SOURCE_SWAPS_QUEUE,
		}),
		BullModule.registerQueue({
			name: TON_DESTINATION_SWAPS_QUEUE,
		}),
		CacheModule.registerAsync({
			imports: [ConfigModule],
			useFactory: async (configService: ConfigService) => ({
				ttl: configService.get<number>("application.cacheTtl"),
			}),
			inject: [ConfigService],
		}),
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
		WalletsModule,
	],
	controllers: [SwapsController],
	providers: [
		SwapsService,
		EventsService,
		EthSourceSwapsProcessor,
		EthDestinationSwapsProcessor,
		TonSourceSwapsProcessor,
		TonDestinationSwapsProcessor,
		{
			provide: EVENT_GROUP_NAME,
			useValue: "swaps",
		},
	],
})
export class SwapsModule {}
