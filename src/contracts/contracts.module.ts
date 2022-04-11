import { Module } from "@nestjs/common"
import { TypeOrmModule } from "@nestjs/typeorm"
import { TonModule } from "src/ton/ton.module"
import { Wallet } from "src/wallets/wallet.entity"
import { WalletsModule } from "src/wallets/wallets.module"
import { ContractsController } from "./contracts.controller"

@Module({
	imports: [TypeOrmModule.forFeature([Wallet]), TonModule, WalletsModule],
	controllers: [ContractsController],
})
export class ContractsModule {}
