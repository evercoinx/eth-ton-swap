import { Injectable } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { InfuraProvider, InjectEthersProvider } from "nestjs-ethers"
import { GetFeesDto } from "./dto/get-fees.dto"

@Injectable()
export class FeesService {
	constructor(
		private readonly configSerivce: ConfigService,
		@InjectEthersProvider()
		private readonly infuraProvider: InfuraProvider,
	) {}

	async findAll(): Promise<GetFeesDto> {
		const gasPrice = await this.infuraProvider.getGasPrice()

		return {
			ethereumGasPrice: gasPrice.toString(),
			bridgeFeePercent: this.configSerivce.get<number>("bridge.feePercent"),
		}
	}
}
