import { ArgumentMetadata, BadRequestException, Injectable, PipeTransform } from "@nestjs/common"
import { Blockchain } from "src/common/enums/blockchain.enum"
import { CreateTokenDto } from "../dto/create-token.dto"

@Injectable()
export class CreateTokenPipe implements PipeTransform<any> {
	async transform(createSwapDto: CreateTokenDto, { metatype }: ArgumentMetadata) {
		if (!metatype || !this.validateMetaType(metatype)) {
			return createSwapDto
		}

		if (createSwapDto.blockchain === Blockchain.TON && !createSwapDto.conjugatedAddress) {
			throw new BadRequestException(
				`A conjugated address must be specified in ${Blockchain.TON}`,
			)
		}

		return createSwapDto
	}

	private validateMetaType(metatype: any): boolean {
		const types = [String, Boolean, Number, Array, Object]
		return !types.includes(metatype)
	}
}
