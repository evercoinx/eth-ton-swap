import { BullModule } from "@nestjs/bull"
import { CacheModule, Module } from "@nestjs/common"
import { ConfigModule, ConfigService } from "@nestjs/config"
import { TypeOrmModule } from "@nestjs/typeorm"
// import * as redisStore from "cache-manager-redis-store"
import { EVENT_GROUP_NAME } from "src/common/constants"
import { EventsService } from "src/common/events.service"
import { TokensModule } from "src/tokens/tokens.module"
import { TonModule } from "src/ton/ton.module"
import { Wallet } from "src/wallets/wallet.entity"
import { WalletsModule } from "src/wallets/wallets.module"
import { TON_DESTINATION_SWAPS_QUEUE, ETH_SOURCE_SWAPS_QUEUE } from "./constants"
import { Swap } from "./swap.entity"
import { SwapsController } from "./swaps.controller"
import { EthSourceSwapsProcessor } from "./processors/eth-source-swaps.processor"
import { TonDestinationSwapsProcessor } from "./processors/ton-destination-swaps.processor"
import { SwapsService } from "./swaps.service"

@Module({
	imports: [
		ConfigModule,
		TypeOrmModule.forFeature([Swap, Wallet]),
		BullModule.registerQueue({
			name: ETH_SOURCE_SWAPS_QUEUE,
		}),
		BullModule.registerQueue({
			name: TON_DESTINATION_SWAPS_QUEUE,
		}),
		CacheModule.registerAsync({
			imports: [ConfigModule],
			useFactory: async (configService: ConfigService) => ({
				// store: redisStore,
				// socket: configService.get("redis"),
				ttl: 60,
			}),
			inject: [ConfigService],
		}),
		TokensModule,
		TonModule.register(),
		WalletsModule,
	],
	controllers: [SwapsController],
	providers: [
		EventsService,
		SwapsService,
		EthSourceSwapsProcessor,
		TonDestinationSwapsProcessor,
		{
			provide: EVENT_GROUP_NAME,
			useValue: "swaps",
		},
	],
})
export class SwapsModule {}
