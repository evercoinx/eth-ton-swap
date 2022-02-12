import { Controller, Get } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { GetFeesDto } from "./dto/get-fees.dto"
import { Blockchain } from "./fee.entity"
import { FeesService } from "./fees.service"

@Controller("fees")
export class FeesController {
	constructor(
		private readonly configSerivce: ConfigService,
		private readonly feesService: FeesService,
	) {}

	@Get()
	async findAll(): Promise<GetFeesDto> {
		const ethereumFee = await this.feesService.findOne(Blockchain.Ethereum)

		return {
			bridgeFeePercent: this.configSerivce.get<number>("bridge.feePercent"),
			ethereumMaxFeePerGas: ethereumFee ? ethereumFee.maxFeePerGas : "0",
		}
	}
}
