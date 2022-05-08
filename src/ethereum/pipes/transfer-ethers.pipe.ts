import { ArgumentMetadata, BadRequestException, Injectable, PipeTransform } from "@nestjs/common"
import { TransferEthersDto } from "../dto/transfer-ethers.dto"
import { EthereumBlockchainService } from "../providers/ethereum-blockchain.service"

@Injectable()
export class TransferEthersPipe implements PipeTransform<any> {
	constructor(private readonly ethereumBlockchainProvider: EthereumBlockchainService) {}

	async transform(transferEthersDto: TransferEthersDto, { metatype }: ArgumentMetadata) {
		if (!metatype || !this.validateMetaType(metatype)) {
			return transferEthersDto
		}

		try {
			transferEthersDto.sourceAddress = this.ethereumBlockchainProvider.normalizeAddress(
				transferEthersDto.sourceAddress.replace(/^0x/, ""),
			)

			transferEthersDto.destinationAddress = this.ethereumBlockchainProvider.normalizeAddress(
				transferEthersDto.destinationAddress.replace(/^0x/, ""),
			)
		} catch (err: unknown) {
			throw new BadRequestException(`Invalid address is specified`)
		}

		return transferEthersDto
	}

	private validateMetaType(metatype: any): boolean {
		const types = [String, Boolean, Number, Array, Object]
		return !types.includes(metatype)
	}
}
