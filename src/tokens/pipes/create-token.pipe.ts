import { ArgumentMetadata, BadRequestException, Injectable, PipeTransform } from "@nestjs/common"
import { CreateTokenDto } from "../dto/create-token.dto"
import { Blockchain } from "../token.entity"

@Injectable()
export class CreateTokenPipe implements PipeTransform<any> {
	async transform(createSwapDto: CreateTokenDto, { metatype }: ArgumentMetadata) {
		if (!metatype || !this.validateMetaType(metatype)) {
			return createSwapDto
		}

		if (createSwapDto.blockchain === Blockchain.TON && !createSwapDto.conjugatedAddress) {
			throw new BadRequestException(
				`A conjugated address must be specified for ${Blockchain.TON}`,
			)
		}

		return createSwapDto
	}

	private validateMetaType(metatype: any): boolean {
		const types = [String, Boolean, Number, Array, Object]
		return !types.includes(metatype)
	}
}
