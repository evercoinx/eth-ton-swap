import { ArgumentMetadata, BadRequestException, Injectable, PipeTransform } from "@nestjs/common"
import { ERROR_INVALID_ADDRESS } from "src/common/constants"
import { TransferEthersDto } from "../dto/transfer-ethers.dto"
import { EthereumBlockchainService } from "../providers/ethereum-blockchain.service"

@Injectable()
export class TransferEthersPipe implements PipeTransform<any> {
	constructor(private readonly ethereumBlockchainService: EthereumBlockchainService) {}

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

	private validateMetaType(metatype: any): boolean {
		const types = [String, Boolean, Number, Array, Object]
		return !types.includes(metatype)
	}
}
