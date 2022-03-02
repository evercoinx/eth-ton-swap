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
import { SOURCE_SWAPS_QUEUE } from "./constants"
import { Swap } from "./swap.entity"
import { SwapsController } from "./swaps.controller"
import { SourceSwapsProcessor } from "./processors/source-swaps.processor"
import { SwapsService } from "./swaps.service"

@Module({
	imports: [
		ConfigModule,
		TypeOrmModule.forFeature([Swap, Wallet]),
		BullModule.registerQueue({
			name: SOURCE_SWAPS_QUEUE,
		}),
		TokensModule,
		TonModule.register({
			isTestnet: true,
			workchain: 0,
			walletVersion: "v3R2",
		}),
		WalletsModule,
	],
	controllers: [SwapsController],
	providers: [
		EventsService,
		SwapsService,
		SourceSwapsProcessor,
		{
			provide: EVENT_GROUP_NAME,
			useValue: "swaps",
		},
	],
})
export class SwapsModule {}
