import { BullModule } from "@nestjs/bull"
import { forwardRef, Module } from "@nestjs/common"
import { ScheduleModule } from "@nestjs/schedule"
import { TypeOrmModule } from "@nestjs/typeorm"
import { EthereumModule } from "src/ethereum/ethereum.module"
import { SettingsModule } from "src/settings/settings.module"
import { TokensModule } from "src/tokens/tokens.module"
import { TonModule } from "src/ton/ton.module"
import { WALLETS_QUEUE } from "./constants"
import { WalletsProcessor } from "./processors/wallets.processor"
import { DepositWalletsBalanceTask } from "./tasks/deposit-wallets-balance.task"
import { SyncWalletsTokenBalanceTask } from "./tasks/sync-wallets-token-balance.task"
import { Wallet } from "./wallet.entity"
import { WalletsController } from "./wallets.controller"
import { WalletsService } from "./wallets.service"

@Module({
	imports: [
		TypeOrmModule.forFeature([Wallet]),
		BullModule.registerQueue({ name: WALLETS_QUEUE }),
		ScheduleModule.forRoot(),
		SettingsModule,
		forwardRef(() => EthereumModule),
		forwardRef(() => TonModule),
		forwardRef(() => TokensModule),
	],
	controllers: [WalletsController],
	providers: [
		WalletsService,
		WalletsProcessor,
		DepositWalletsBalanceTask,
		SyncWalletsTokenBalanceTask,
	],
	exports: [WalletsService],
})
export class WalletsModule {}
