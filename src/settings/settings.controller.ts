import { CacheInterceptor, Controller, Get, UseInterceptors } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import BigNumber from "bignumber.js"
import { GetSettingsDto } from "./dto/get-settings.dto"
import { ETHER_DECIMALS } from "src/ethereum/constants"
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
		const ethereumFee = await this.feesService.findByBlockchain(Blockchain.Ethereum)
		const gasFee = new BigNumber(ethereumFee ? ethereumFee.gasFee : 0)

		return {
			fees: {
				bridgeFeePercent: this.configSerivce.get<number>("bridge.feePercent"),
				ethereumGasFee: gasFee.toFixed(ETHER_DECIMALS),
			},
			minSwapAmount: this.configSerivce.get<BigNumber>("bridge.minSwapAmount").toString(),
			maxSwapAmount: this.configSerivce.get<BigNumber>("bridge.maxSwapAmount").toString(),
		}
	}
}
