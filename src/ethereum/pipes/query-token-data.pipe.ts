import { ArgumentMetadata, BadRequestException, Injectable, PipeTransform } from "@nestjs/common"
import { ERROR_INVALID_ADDRESS } from "src/common/constants"
import { QueryTokenDataDto } from "../dto/query-token-data.dto"
import { EthereumBlockchainService } from "../providers/ethereum-blockchain.service"

@Injectable()
export class QueryTokenDataPipe implements PipeTransform<any> {
	constructor(private readonly ethereumBlockchainService: EthereumBlockchainService) {}

	async transform(queryTokenDataDto: QueryTokenDataDto, { metatype }: ArgumentMetadata) {
		if (!metatype || !this.validateMetaType(metatype)) {
			return queryTokenDataDto
		}

		try {
			queryTokenDataDto.tokenAddresses.forEach((tokenAddress) =>
				this.ethereumBlockchainService.normalizeAddress(tokenAddress),
			)
		} catch (err: unknown) {
			throw new BadRequestException(ERROR_INVALID_ADDRESS)
		}

		return queryTokenDataDto
	}

	private validateMetaType(metatype: any): boolean {
		const types = [String, Boolean, Number, Array, Object]
		return !types.includes(metatype)
	}
}
