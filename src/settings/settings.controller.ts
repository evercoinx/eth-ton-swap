import { CacheInterceptor, Controller, Get, UseInterceptors } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import BigNumber from "bignumber.js"
import { GetSettingsDto } from "./dto/get-settings.dto"
import { FeesService } from "src/fees/fees.service"
import { Blockchain } from "src/tokens/token.entity"

@Controller("settings")
@UseInterceptors(CacheInterceptor)
export class SettingsController {
	constructor(
		private readonly configSerivce: ConfigService,
		private readonly feesService: FeesService,
	) {}

	@Get()
	async getSettings(): Promise<GetSettingsDto> {
		const ethFee = await this.feesService.findByBlockchain(Blockchain.Ethereum)

		return {
			fees: {
				bridgeFeePercent: this.configSerivce.get<number>("bridge.feePercent"),
				ethereumGasFee: ethFee ? ethFee.gasFee : "0",
			},
			minSwapAmount: this.configSerivce.get<BigNumber>("bridge.minSwapAmount").toString(),
			maxSwapAmount: this.configSerivce.get<BigNumber>("bridge.maxSwapAmount").toString(),
		}
	}
}
