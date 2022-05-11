import { ArgumentMetadata, Injectable, PipeTransform } from "@nestjs/common"
import { ERROR_INVALID_ADDRESS } from "src/common/constants"
import { BadRequestException } from "src/common/exceptions/bad-request.exception"
import { TonBlockchainService } from "src/ton/providers/ton-blockchain.service"
import { QueryContractDataDto } from "../dto/query-contract-data.dto"

@Injectable()
export class QueryContractDataPipe implements PipeTransform<any> {
	constructor(private readonly tonBlockchainService: TonBlockchainService) {}

	async transform(queryContractDataDto: QueryContractDataDto, { metatype }: ArgumentMetadata) {
		if (!metatype || !this.validateMetaType(metatype)) {
			return queryContractDataDto
		}

		try {
			queryContractDataDto.address = this.tonBlockchainService.normalizeAddress(
				queryContractDataDto.address,
			)
		} catch (err: unknown) {
			throw new BadRequestException(ERROR_INVALID_ADDRESS)
		}

		return queryContractDataDto
	}

	private validateMetaType(metatype: any): boolean {
		const types = [String, Boolean, Number, Array, Object]
		return !types.includes(metatype)
	}
}
