import { Controller, Get, UseGuards } from "@nestjs/common"
import { JwtAuthGuard } from "src/auth/guards/jwt-auth.guard"
import { SwapsRepository } from "src/swaps/providers/swaps.repository"
import { TokensRepository } from "src/tokens/providers/tokens.repository"
import { WalletsService } from "src/wallets/providers/wallets.service"
import { GetStatsDto } from "./dto/get-stats.dto"

@Controller("stats")
export class StatsController {
	constructor(
		private readonly swapsRepository: SwapsRepository,
		private readonly tokensRepository: TokensRepository,
		private readonly walletsService: WalletsService,
	) {}

	@UseGuards(JwtAuthGuard)
	@Get()
	async getStats(): Promise<GetStatsDto> {
		const tokens = await this.tokensRepository.findAll()

		const statsDto: GetStatsDto = {
			wallets: {},
			swaps: {},
		}
		for (const token of tokens) {
			const symbol = token.symbol.toLowerCase()

			const walletsStats = await this.walletsService.countStats(token.address)
			statsDto.wallets[symbol] = walletsStats

			const swapsStats = await this.swapsRepository.countStats(token.address)
			statsDto.swaps[`${symbol}->any`] = swapsStats
		}

		return statsDto
	}
}
