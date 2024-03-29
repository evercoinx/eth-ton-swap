import { BullModule } from "@nestjs/bull"
import { CacheModule, Module } from "@nestjs/common"
import { ConfigModule, ConfigService } from "@nestjs/config"
import { TypeOrmModule } from "@nestjs/typeorm"
import { CommonModule } from "src/common/common.module"
import { EventsService } from "src/common/providers/events.service"
import { EthereumModule } from "src/ethereum/ethereum.module"
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
import { SwapsController } from "./controllers/swaps.controller"
import { EthDestinationSwapsProcessor } from "./processors/eth-destination-swaps.processor"
import { EthSourceSwapsProcessor } from "./processors/eth-source-swaps.processor"
import { TonDestinationSwapsProcessor } from "./processors/ton-destination-swaps.processor"
import { TonSourceSwapsProcessor } from "./processors/ton-source-swaps.processor"
import { EthereumCacheHelper } from "./providers/ethereum-cache.helper"
import { SwapsHelper } from "./providers/swaps.helper"
import { SwapsRepository } from "./providers/swaps.repository"
import { Swap } from "./swap.entity"

@Module({
	imports: [
		ConfigModule,
		TypeOrmModule.forFeature([Swap, Wallet]),
		BullModule.registerQueue({ name: ETH_SOURCE_SWAPS_QUEUE }),
		BullModule.registerQueue({ name: ETH_DESTINATION_SWAPS_QUEUE }),
		BullModule.registerQueue({ name: TON_SOURCE_SWAPS_QUEUE }),
		BullModule.registerQueue({ name: TON_DESTINATION_SWAPS_QUEUE }),
		CacheModule.registerAsync({
			imports: [ConfigModule],
			inject: [ConfigService],
			useFactory: async (configService: ConfigService) => ({
				ttl: configService.get<number>("application.cacheTtl"),
			}),
		}),
		CommonModule,
		EthereumModule,
		TonModule,
		TokensModule,
		WalletsModule,
	],
	controllers: [SwapsController],
	providers: [
		SwapsHelper,
		SwapsRepository,
		EventsService,
		EthereumCacheHelper,
		EthSourceSwapsProcessor,
		EthDestinationSwapsProcessor,
		TonSourceSwapsProcessor,
		TonDestinationSwapsProcessor,
	],
	exports: [SwapsRepository],
})
export class SwapsModule {}
