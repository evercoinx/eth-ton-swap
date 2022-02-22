import { BullModule } from "@nestjs/bull"
import { Module } from "@nestjs/common"
import { ConfigModule } from "@nestjs/config"
import { TypeOrmModule } from "@nestjs/typeorm"
import { EVENT_GROUP_NAME } from "src/app/constants"
import { EventsService } from "src/app/events.service"
import { TokensModule } from "src/tokens/tokens.module"
import { Wallet } from "src/wallets/wallet.entity"
import { WalletsModule } from "src/wallets/wallets.module"
import { SWAPS_QUEUE } from "./contstants"
import { Swap } from "./swap.entity"
import { SwapsController } from "./swaps.controller"
import { SwapsProcessor } from "./swaps.processor"
import { SwapsService } from "./swaps.service"

@Module({
	imports: [
		ConfigModule,
		TypeOrmModule.forFeature([Swap, Wallet]),
		BullModule.registerQueue({
			name: SWAPS_QUEUE,
		}),
		TokensModule,
		WalletsModule,
	],
	controllers: [SwapsController],
	providers: [
		EventsService,
		SwapsService,
		SwapsProcessor,
		{
			provide: EVENT_GROUP_NAME,
			useValue: "swaps",
		},
	],
})
export class SwapsModule {}
