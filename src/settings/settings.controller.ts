import { CacheInterceptor, Controller, Get, UseInterceptors } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import BigNumber from "bignumber.js"
import { GetSettingsDto } from "./dto/get-settings.dto"
import { SettingsService } from "./settings.service"
import { Blockchain } from "src/tokens/token.entity"
import { TokensService } from "src/tokens/tokens.service"

@Controller("settings")
@UseInterceptors(CacheInterceptor)
export class SettingsController {
	constructor(
		private readonly configSerivce: ConfigService,
		private readonly settingsService: SettingsService,
		private readonly tokensService: TokensService,
	) {}

	@Get()
	async getSettings(): Promise<GetSettingsDto> {
		const settings: GetSettingsDto = {
			swapFee: this.configSerivce.get<number>("bridge.swapFee"),
			limits: {},
			fees: {},
		}

		const tokens = await this.tokensService.findAll()
		if (!tokens.length) {
			return settings
		}

		const blockchains = new Set<Blockchain>()
		for (const token of tokens) {
			blockchains.add(token.blockchain)

			settings.limits[token.id] = {
				minAmount: this.configSerivce
					.get<BigNumber>("bridge.minTokenAmount")
					.toFixed(token.decimals),
				maxAmount: this.configSerivce
					.get<BigNumber>("bridge.maxTokenAmount")
					.toFixed(token.decimals),
			}
		}

		for (const blockchain of blockchains) {
			const setting = await this.settingsService.findByBlockchain(blockchain)
			const gasFee = new BigNumber(setting ? setting.gasFee : 0)

			settings.fees[blockchain] = {
				gasFee: gasFee.toFixed(setting ? setting.decimals : 0),
			}
		}

		return settings
	}
}
