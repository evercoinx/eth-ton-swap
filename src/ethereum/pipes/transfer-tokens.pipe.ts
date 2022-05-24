import { ArgumentMetadata, BadRequestException, Injectable, PipeTransform } from "@nestjs/common"
import { ERROR_INVALID_ADDRESS } from "src/common/constants"
import { TransferTokensDto } from "../dto/transfer-tokens.dto"
import { EthereumBlockchainService } from "../providers/ethereum-blockchain.service"

@Injectable()
export class TransferTokensPipe implements PipeTransform<any> {
	constructor(private readonly ethereumBlockchainService: EthereumBlockchainService) {}

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

	private validateMetaType(metatype: any): boolean {
		const types = [String, Boolean, Number, Array, Object]
		return !types.includes(metatype)
	}
}
