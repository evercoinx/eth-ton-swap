import { ArgumentMetadata, BadRequestException, Injectable, PipeTransform } from "@nestjs/common"
import { ERROR_INVALID_ADDRESS } from "src/common/constants"
import { BaseValidationPipe } from "src/common/pipes/base-validation.pipe"
import { TonBlockchainService } from "src/ton/providers/ton-blockchain.service"
import { UpdateTokenDto } from "../dto/update-token.dto"

@Injectable()
export class UpdateTokenPipe
	extends BaseValidationPipe
	implements PipeTransform<UpdateTokenDto, Promise<UpdateTokenDto>>
{
	constructor(private readonly tonBlockchainService: TonBlockchainService) {
		super()
	}

	async transform(updateTokenDto: UpdateTokenDto, { metatype }: ArgumentMetadata) {
		if (!metatype || !this.validateMetaType(metatype)) {
			return updateTokenDto
		}

		if (updateTokenDto.conjugatedAddress) {
			try {
				updateTokenDto.conjugatedAddress = this.tonBlockchainService.normalizeAddress(
					updateTokenDto.conjugatedAddress,
				)
			} catch (err: unknown) {
				throw new BadRequestException(ERROR_INVALID_ADDRESS)
			}
		}

		return updateTokenDto
	}
}
