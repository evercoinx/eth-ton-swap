import { BullModule } from "@nestjs/bull"
import { forwardRef, Module } from "@nestjs/common"
import { ScheduleModule } from "@nestjs/schedule"
import { TypeOrmModule } from "@nestjs/typeorm"
import { CommonModule } from "src/common/common.module"
import { EthereumModule } from "src/ethereum/ethereum.module"
import { SettingsModule } from "src/settings/settings.module"
import { TokensModule } from "src/tokens/tokens.module"
import { TonModule } from "src/ton/ton.module"
import { WALLETS_QUEUE } from "./constants"
import { TasksController } from "./controllers/tasks.controller"
import { WalletsController } from "./controllers/wallets.controller"
import { WalletsProcessor } from "./processors/wallets.processor"
import { WalletsRepository } from "./providers/wallets.repository"
import { DepositWalletsBalanceTask } from "./tasks/deposit-wallets-balance.task"
import { SyncWalletsTokenBalanceTask } from "./tasks/sync-wallets-token-balance.task"
import { Wallet } from "./wallet.entity"

@Module({
	imports: [
		TypeOrmModule.forFeature([Wallet]),
		BullModule.registerQueue({ name: WALLETS_QUEUE }),
		ScheduleModule.forRoot(),
		CommonModule,
		SettingsModule,
		forwardRef(() => EthereumModule),
		forwardRef(() => TonModule),
		forwardRef(() => TokensModule),
	],
	controllers: [WalletsController, TasksController],
	providers: [
		WalletsRepository,
		WalletsProcessor,
		DepositWalletsBalanceTask,
		SyncWalletsTokenBalanceTask,
	],
	exports: [WalletsRepository],
})
export class WalletsModule {}
