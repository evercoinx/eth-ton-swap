import { Module } from "@nestjs/common"
import { TypeOrmModule } from "@nestjs/typeorm"
import { Wallet } from "./wallet.entity"
import { WalletsController } from "./wallets.controller"
import { WalletsService } from "./wallets.service"

@Module({
	imports: [TypeOrmModule.forFeature([Wallet])],
	controllers: [WalletsController],
	providers: [WalletsService],
	exports: [WalletsService],
})
export class WalletsModule {}
