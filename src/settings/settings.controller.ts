import { Controller, Get } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { GetSettingsDto } from "./dto/get-settings.dto"
import { FeesService } from "src/fees/fees.service"
import { Blockchain } from "src/tokens/token.entity"

@Controller("settings")
export class SettingsController {
	constructor(
		private readonly configSerivce: ConfigService,
		private readonly feesService: FeesService,
	) {}

	@Get()
	async findAll(): Promise<GetSettingsDto> {
		const ethereumFee = await this.feesService.findOne(Blockchain.Ethereum)

		return {
			fees: {
				bridgeFeePercent: this.configSerivce.get<number>("bridge.feePercent"),
				ethereumGasFee: ethereumFee ? ethereumFee.gasFee : "0",
			},
			minSwapAmount: this.configSerivce.get<number>("bridge.minSwapAmount"),
			maxSwapAmount: this.configSerivce.get<number>("bridge.maxSwapAmount"),
		}
	}
}
