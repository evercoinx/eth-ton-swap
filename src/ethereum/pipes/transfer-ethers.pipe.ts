import { ArgumentMetadata, BadRequestException, Injectable, PipeTransform } from "@nestjs/common"
import { ERROR_INVALID_ADDRESS } from "src/common/constants"
import { BaseValidationPipe } from "src/common/pipes/base-validation.pipe"
import { TransferEthersDto } from "../dto/transfer-ethers.dto"
import { EthereumBlockchainService } from "../providers/ethereum-blockchain.service"

@Injectable()
export class TransferEthersPipe
	extends BaseValidationPipe
	implements PipeTransform<TransferEthersDto, Promise<TransferEthersDto>>
{
	constructor(private readonly ethereumBlockchainService: EthereumBlockchainService) {
		super()
	}

	async transform(transferEthersDto: TransferEthersDto, { metatype }: ArgumentMetadata) {
		if (!metatype || !this.validateMetaType(metatype)) {
			return transferEthersDto
		}

		try {
			transferEthersDto.sourceAddress = this.ethereumBlockchainService.normalizeAddress(
				transferEthersDto.sourceAddress,
			)

			transferEthersDto.destinationAddress = this.ethereumBlockchainService.normalizeAddress(
				transferEthersDto.destinationAddress,
			)
		} catch (err: unknown) {
			throw new BadRequestException(ERROR_INVALID_ADDRESS)
		}

		return transferEthersDto
	}
}
