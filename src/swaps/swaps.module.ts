import { BullModule } from "@nestjs/bull"
import { Module } from "@nestjs/common"
import { TypeOrmModule } from "@nestjs/typeorm"
import { SWAPS_QUEUE } from "./contstants"
import { Swap } from "./swap.entity"
import { SwapsController } from "./swaps.controller"
import { SwapsProcessor } from "./swaps.processor"
import { SwapsService } from "./swaps.service"
import { TokensModule } from "../tokens/tokens.module"
import { Wallet } from "../wallets/wallet.entity"
import { WalletsModule } from "../wallets/wallets.module"

@Module({
	imports: [
		TypeOrmModule.forFeature([Swap, Wallet]),
		BullModule.registerQueue({
			name: SWAPS_QUEUE,
		}),
		TokensModule,
		WalletsModule,
	],
	controllers: [SwapsController],
	providers: [SwapsService, SwapsProcessor],
})
export class SwapsModule {}
