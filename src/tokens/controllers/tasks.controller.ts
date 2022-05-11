import { Controller, HttpCode, HttpStatus, Post, UseGuards } from "@nestjs/common"
import { JwtAuthGuard } from "src/auth/guards/jwt-auth.guard"
import { SyncTokensPriceTask } from "../tasks/sync-tokens-price.task"

@Controller("tasks")
export class TasksController {
	constructor(private readonly syncTokensPriceTask: SyncTokensPriceTask) {}

	@UseGuards(JwtAuthGuard)
	@HttpCode(HttpStatus.NO_CONTENT)
	@Post("sync-tokens-price")
	async syncTokensPrice(): Promise<void> {
		this.syncTokensPriceTask.run()
	}
}
