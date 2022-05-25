import { ArgumentMetadata, BadRequestException, Injectable, PipeTransform } from "@nestjs/common"
import { ERROR_INVALID_ADDRESS } from "src/common/constants"
import { BaseValidationPipe } from "src/common/pipes/base-validation.pipe"
import { TransferTokensDto } from "../dto/transfer-tokens.dto"
import { EthereumBlockchainService } from "../providers/ethereum-blockchain.service"

@Injectable()
export class TransferTokensPipe
	extends BaseValidationPipe
	implements PipeTransform<TransferTokensDto, Promise<TransferTokensDto>>
{
	constructor(private readonly ethereumBlockchainService: EthereumBlockchainService) {
		super()
	}

	async transform(transferTokensDto: TransferTokensDto, { metatype }: ArgumentMetadata) {
		if (!metatype || !this.validateMetaType(metatype)) {
			return transferTokensDto
		}

		try {
			transferTokensDto.tokenAddress = this.ethereumBlockchainService.normalizeAddress(
				transferTokensDto.tokenAddress,
			)

			transferTokensDto.sourceAddress = this.ethereumBlockchainService.normalizeAddress(
				transferTokensDto.sourceAddress,
			)

			transferTokensDto.destinationAddress = this.ethereumBlockchainService.normalizeAddress(
				transferTokensDto.destinationAddress,
			)
		} catch (err: unknown) {
			throw new BadRequestException(ERROR_INVALID_ADDRESS)
		}

		return transferTokensDto
	}
}
