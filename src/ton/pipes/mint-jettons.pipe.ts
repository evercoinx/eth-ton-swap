import { ArgumentMetadata, BadRequestException, Injectable, PipeTransform } from "@nestjs/common"
import { ERROR_INVALID_ADDRESS } from "src/common/constants"
import { TonBlockchainService } from "src/ton/providers/ton-blockchain.service"
import { MintJettonsDto } from "../dto/mint-jettons.dto"

@Injectable()
export class MintJettonsPipe implements PipeTransform<any> {
	constructor(private readonly tonBlockchainService: TonBlockchainService) {}

	async transform(mintJettonsDto: MintJettonsDto, { metatype }: ArgumentMetadata) {
		if (!metatype || !this.validateMetaType(metatype)) {
			return mintJettonsDto
		}

		try {
			mintJettonsDto.adminAddress = this.tonBlockchainService.normalizeAddress(
				mintJettonsDto.adminAddress,
			)

			mintJettonsDto.destinationAddress = this.tonBlockchainService.normalizeAddress(
				mintJettonsDto.destinationAddress,
			)
		} catch (err: unknown) {
			throw new BadRequestException(ERROR_INVALID_ADDRESS)
		}

		return mintJettonsDto
	}

	private validateMetaType(metatype: any): boolean {
		const types = [String, Boolean, Number, Array, Object]
		return !types.includes(metatype)
	}
}
