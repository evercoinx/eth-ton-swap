import { Controller, HttpCode, HttpStatus, Post, UseGuards } from "@nestjs/common"
import { JwtAuthGuard } from "src/auth/guards/jwt-auth.guard"
import { SyncSettingsGasFeeTask } from "../tasks/sync-settings-gas-fee.task"

@Controller("tasks")
export class TasksController {
	constructor(private readonly syncSettingsGasFeeTask: SyncSettingsGasFeeTask) {}

	@UseGuards(JwtAuthGuard)
	@HttpCode(HttpStatus.NO_CONTENT)
	@Post("sync-settings-gas-fee")
	async syncSettingsGasFee(): Promise<void> {
		this.syncSettingsGasFeeTask.runEthereum()
	}
}
