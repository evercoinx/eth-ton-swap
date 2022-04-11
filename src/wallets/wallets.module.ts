import { Module } from "@nestjs/common"
import { ScheduleModule } from "@nestjs/schedule"
import { TypeOrmModule } from "@nestjs/typeorm"
import { EthereumModule } from "src/ethereum/ethereum.module"
import { TokensModule } from "src/tokens/tokens.module"
import { TonModule } from "src/ton/ton.module"
import { Wallet } from "./wallet.entity"
import { WalletsController } from "./wallets.controller"
import { WalletsService } from "./wallets.service"
import { WalletsTask } from "./wallets.task"

@Module({
	imports: [
		TypeOrmModule.forFeature([Wallet]),
		ScheduleModule.forRoot(),
		EthereumModule,
		TonModule,
		TokensModule,
	],
	controllers: [WalletsController],
	providers: [WalletsService, WalletsTask],
	exports: [WalletsService],
})
export class WalletsModule {}
