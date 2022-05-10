import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from "@nestjs/common"
import { JwtAuthGuard } from "src/auth/guards/jwt-auth.guard"
import { Blockchain } from "src/common/enums/blockchain.enum"
import { DepositWalletsBalanceDto } from "../dto/deposit-wallets-balance.dto"
import { SyncWalletsTokenBalanceDto } from "../dto/sync-wallets-token-balance.dto"
import { DepositWalletsBalanceTask } from "../tasks/deposit-wallets-balance.task"
import { SyncWalletsTokenBalanceTask } from "../tasks/sync-wallets-token-balance.task"

@Controller("tasks")
export class TasksController {
	constructor(
		private readonly depositWalletsBalanceTask: DepositWalletsBalanceTask,
		private readonly syncWalletsTokenBalanceTask: SyncWalletsTokenBalanceTask,
	) {}

	@UseGuards(JwtAuthGuard)
	@HttpCode(HttpStatus.NO_CONTENT)
	@Post("deposit-wallets-balance")
	async depositWalletsBalance(
		@Body() depositWalletsBalanceDto: DepositWalletsBalanceDto,
	): Promise<void> {
		if (depositWalletsBalanceDto.blockchains.includes(Blockchain.Ethereum)) {
			this.depositWalletsBalanceTask.runEthereum()
		}
		if (depositWalletsBalanceDto.blockchains.includes(Blockchain.TON)) {
			this.depositWalletsBalanceTask.runTon()
		}
	}

	@UseGuards(JwtAuthGuard)
	@HttpCode(HttpStatus.NO_CONTENT)
	@Post("sync-wallets-token-balance")
	async syncWalletsTokenBalance(
		@Body() syncWalletsTokenBalanceDto: SyncWalletsTokenBalanceDto,
	): Promise<void> {
		if (syncWalletsTokenBalanceDto.blockchains.includes(Blockchain.Ethereum)) {
			this.syncWalletsTokenBalanceTask.runEthereum()
		}
		if (syncWalletsTokenBalanceDto.blockchains.includes(Blockchain.TON)) {
			this.syncWalletsTokenBalanceTask.runTon()
		}
	}
}
