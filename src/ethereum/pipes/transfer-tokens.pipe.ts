import { ArgumentMetadata, BadRequestException, Injectable, PipeTransform } from "@nestjs/common"
import { TransferTokensDto } from "../dto/transfer-tokens.dto"
import { EthereumBlockchainProvider } from "../ethereum-blockchain.provider"

@Injectable()
export class TransferTokensPipe implements PipeTransform<any> {
	constructor(private readonly ethereumBlockchainProvider: EthereumBlockchainProvider) {}

	async transform(transferTokensDto: TransferTokensDto, { metatype }: ArgumentMetadata) {
		if (!metatype || !this.validateMetaType(metatype)) {
			return transferTokensDto
		}

		try {
			transferTokensDto.tokenAddress = this.ethereumBlockchainProvider.normalizeAddress(
				transferTokensDto.tokenAddress.replace(/^0x/, ""),
			)

			transferTokensDto.sourceAddress = this.ethereumBlockchainProvider.normalizeAddress(
				transferTokensDto.sourceAddress.replace(/^0x/, ""),
			)

			transferTokensDto.destinationAddress = this.ethereumBlockchainProvider.normalizeAddress(
				transferTokensDto.destinationAddress.replace(/^0x/, ""),
			)
		} catch (err: unknown) {
			throw new BadRequestException(`Invalid address is specified`)
		}

		return transferTokensDto
	}

	private validateMetaType(metatype: any): boolean {
		const types = [String, Boolean, Number, Array, Object]
		return !types.includes(metatype)
	}
}
