import { ArgumentMetadata, BadRequestException, Injectable, PipeTransform } from "@nestjs/common"
import { ERROR_INVALID_ADDRESS } from "src/common/constants"
import { BaseValidationPipe } from "src/common/pipes/base-validation.pipe"
import { TonBlockchainService } from "src/ton/providers/ton-blockchain.service"
import { TransferJettonsDto } from "../dto/transfer-jettons.dto"

@Injectable()
export class TransferJettonsPipe
	extends BaseValidationPipe
	implements PipeTransform<TransferJettonsDto, Promise<TransferJettonsDto>>
{
	constructor(private readonly tonBlockchainService: TonBlockchainService) {
		super()
	}

	async transform(transferJettonsDto: TransferJettonsDto, { metatype }: ArgumentMetadata) {
		if (!metatype || !this.validateMetaType(metatype)) {
			return transferJettonsDto
		}

		try {
			transferJettonsDto.minterAdminWalletAddress =
				this.tonBlockchainService.normalizeAddress(
					transferJettonsDto.minterAdminWalletAddress,
				)

			transferJettonsDto.sourceAddress = this.tonBlockchainService.normalizeAddress(
				transferJettonsDto.sourceAddress,
			)

			transferJettonsDto.destinationAddress = this.tonBlockchainService.normalizeAddress(
				transferJettonsDto.destinationAddress,
			)
		} catch (err: unknown) {
			throw new BadRequestException(ERROR_INVALID_ADDRESS)
		}

		return transferJettonsDto
	}
}
