import { Controller, Get, UseGuards } from "@nestjs/common"
import { JwtAuthGuard } from "src/auth/guards/jwt-auth.guard"
import { TokensService } from "src/tokens/tokens.service"
import { WalletsService } from "src/wallets/wallets.service"
import { GetWalletsStatsDto } from "./dto/get-wallets-stats.dto"

@Controller("stats")
export class StatsController {
	constructor(
		private readonly tokensSerivce: TokensService,
		private readonly walletsService: WalletsService,
	) {}

	@UseGuards(JwtAuthGuard)
	@Get()
	async getStats(): Promise<GetWalletsStatsDto> {
		const tokens = await this.tokensSerivce.findAll()

		const statsDto: GetWalletsStatsDto = { wallets: {} }
		for (const token of tokens) {
			const { total, available, inUse } = await this.walletsService.countStats(token.address)

			statsDto.wallets[token.symbol] = {
				total,
				available,
				inUse,
			}
		}
		return statsDto
	}
}
