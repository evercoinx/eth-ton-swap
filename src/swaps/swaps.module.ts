import { Module } from "@nestjs/common"
import { TypeOrmModule } from "@nestjs/typeorm"
import { Swap } from "./swap.entity"
import { Wallet } from "../wallets/wallet.entity"
import { SwapsService } from "./swaps.service"
import { WalletsService } from "../wallets/wallets.service"
import { SwapsController } from "./swaps.controller"

@Module({
	imports: [TypeOrmModule.forFeature([Swap, Wallet])],
	providers: [SwapsService, WalletsService],
	controllers: [SwapsController],
})
export class SwapsModule {}
