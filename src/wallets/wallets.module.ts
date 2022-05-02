import { BullModule } from "@nestjs/bull"
import { forwardRef, Module } from "@nestjs/common"
import { ScheduleModule } from "@nestjs/schedule"
import { TypeOrmModule } from "@nestjs/typeorm"
import { EthereumModule } from "src/ethereum/ethereum.module"
import { TokensModule } from "src/tokens/tokens.module"
import { TonModule } from "src/ton/ton.module"
import { WALLETS_QUEUE } from "./constants"
import { Wallet } from "./wallet.entity"
import { WalletsController } from "./wallets.controller"
import { WalletsProcessor } from "./wallets.processor"
import { WalletsService } from "./wallets.service"
import { WalletsTokenBalanceTask } from "./tasks/wallets-token-balance.task"

@Module({
	imports: [
		TypeOrmModule.forFeature([Wallet]),
		BullModule.registerQueue({ name: WALLETS_QUEUE }),
		ScheduleModule.forRoot(),
		forwardRef(() => EthereumModule),
		forwardRef(() => TonModule),
		forwardRef(() => TokensModule),
	],
	controllers: [WalletsController],
	providers: [WalletsService, WalletsProcessor, WalletsTokenBalanceTask],
	exports: [WalletsService],
})
export class WalletsModule {}
