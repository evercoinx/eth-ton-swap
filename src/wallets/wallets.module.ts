import { Module } from "@nestjs/common"
import { TypeOrmModule } from "@nestjs/typeorm"
import { Wallet } from "./wallet.entity"
import { WalletsController } from "./wallets.controller"
import { WalletsService } from "./wallets.service"
import { TokensModule } from "../tokens/tokens.module"

@Module({
	imports: [TypeOrmModule.forFeature([Wallet]), TokensModule],
	controllers: [WalletsController],
	providers: [WalletsService],
	exports: [WalletsService],
})
export class WalletsModule {}
