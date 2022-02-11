import { Module } from "@nestjs/common"
import { TypeOrmModule } from "@nestjs/typeorm"
import { Swap } from "./swap.entity"
import { Wallet } from "../wallets/wallet.entity"
import { SwapsService } from "./swaps.service"
import { SwapsController } from "./swaps.controller"
import { WalletsModule } from "../wallets/wallets.module"

@Module({
	imports: [TypeOrmModule.forFeature([Swap, Wallet]), WalletsModule],
	providers: [SwapsService],
	controllers: [SwapsController],
})
export class SwapsModule {}
