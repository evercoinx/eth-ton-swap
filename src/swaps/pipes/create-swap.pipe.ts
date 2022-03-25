import { ArgumentMetadata, BadRequestException, Injectable, PipeTransform } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import BigNumber from "bignumber.js"
import { getAddress } from "nestjs-ethers"
import { TonService } from "src/ton/ton.service"
import { CreateSwapDto } from "../dto/create-swap.dto"

@Injectable()
export class CreateSwapPipe implements PipeTransform<any> {
	constructor(
		private readonly configService: ConfigService,
		private readonly tonService: TonService,
	) {}

	async transform(createSwapDto: CreateSwapDto, { metatype }: ArgumentMetadata) {
		if (!metatype || !this.validateMetaType(metatype)) {
			return createSwapDto
		}

		const sourceAmount = new BigNumber(createSwapDto.sourceAmount)
		const minSwapAmount = this.configService.get<BigNumber>("bridge.minSwapAmount")
		if (sourceAmount.lt(minSwapAmount)) {
			throw new BadRequestException(
				`${createSwapDto.sourceAmount} is below the minimum allowed swap amount`,
			)
		}

		const maxSwapAmount = this.configService.get<BigNumber>("bridge.maxSwapAmount")
		if (sourceAmount.gt(maxSwapAmount)) {
			throw new BadRequestException(
				`${createSwapDto.sourceAmount} is above the maximum allowed swap amount`,
			)
		}

		const validAddresses = [
			this.tonService.validateAddress(createSwapDto.destinationAddress),
			this.validateEthAddress(createSwapDto.destinationAddress),
		]
		if (!validAddresses.filter(Boolean).length) {
			throw new BadRequestException(
				`Invalid destination address ${createSwapDto.destinationAddress} is provided`,
			)
		}

		return createSwapDto
	}

	private validateEthAddress(address: string): boolean {
		try {
			getAddress(address)
			return true
		} catch (err: unknown) {
			return false
		}
	}

	private validateMetaType(metatype: any): boolean {
		const types = [String, Boolean, Number, Array, Object]
		return !types.includes(metatype)
	}
}
