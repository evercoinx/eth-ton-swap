import { BullModule } from "@nestjs/bull"
import { Module } from "@nestjs/common"
import { ConfigModule } from "@nestjs/config"
import { TypeOrmModule } from "@nestjs/typeorm"
import { EVENT_GROUP_NAME } from "src/common/constants"
import { EventsService } from "src/common/events.service"
import { TokensModule } from "src/tokens/tokens.module"
import { TonModule } from "src/ton/ton.module"
import { Wallet } from "src/wallets/wallet.entity"
import { WalletsModule } from "src/wallets/wallets.module"
import { DESTINATION_SWAPS_QUEUE, SOURCE_SWAPS_QUEUE } from "./constants"
import { Swap } from "./swap.entity"
import { SwapsController } from "./swaps.controller"
import { DestinationSwapsProcessor } from "./processors/destination-swaps.processor"
import { SourceSwapsProcessor } from "./processors/source-swaps.processor"
import { SwapsService } from "./swaps.service"

@Module({
	imports: [
		ConfigModule,
		TypeOrmModule.forFeature([Swap, Wallet]),
		BullModule.registerQueue({
			name: SOURCE_SWAPS_QUEUE,
		}),
		BullModule.registerQueue({
			name: DESTINATION_SWAPS_QUEUE,
		}),
		TokensModule,
		TonModule.register(),
		WalletsModule,
	],
	controllers: [SwapsController],
	providers: [
		EventsService,
		SwapsService,
		SourceSwapsProcessor,
		DestinationSwapsProcessor,
		{
			provide: EVENT_GROUP_NAME,
			useValue: "swaps",
		},
	],
})
export class SwapsModule {}
