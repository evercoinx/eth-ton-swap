import { ArgumentMetadata, BadRequestException, Injectable, PipeTransform } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import BigNumber from "bignumber.js"
import { CreateSwapDto } from "../dto/create-swap.dto"

@Injectable()
export class CreateSwapPipe implements PipeTransform<any> {
	constructor(private readonly configService: ConfigService) {}

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

		return createSwapDto
	}

	private validateMetaType(metatype: any): boolean {
		const types = [String, Boolean, Number, Array, Object]
		return !types.includes(metatype)
	}
}
