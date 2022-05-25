import { ArgumentMetadata, BadRequestException, Injectable, PipeTransform } from "@nestjs/common"
import { ERROR_INVALID_ADDRESS } from "src/common/constants"
import { BaseValidationPipe } from "src/common/pipes/base-validation.pipe"
import { TonBlockchainService } from "src/ton/providers/ton-blockchain.service"
import { MintJettonsDto } from "../dto/mint-jettons.dto"

@Injectable()
export class MintJettonsPipe
	extends BaseValidationPipe
	implements PipeTransform<MintJettonsDto, Promise<MintJettonsDto>>
{
	constructor(private readonly tonBlockchainService: TonBlockchainService) {
		super()
	}

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
}
