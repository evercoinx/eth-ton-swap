import { ArgumentMetadata, BadRequestException, Injectable, PipeTransform } from "@nestjs/common"
import { TonBlockchainService } from "src/ton/providers/ton-blockchain.service"
import { QueryContractDataDto } from "../dto/query-contract-data.dto"

@Injectable()
export class QueryContractDataPipe implements PipeTransform<any> {
	constructor(private readonly tonBlockchainProvider: TonBlockchainService) {}

	async transform(queryContractDataDto: QueryContractDataDto, { metatype }: ArgumentMetadata) {
		if (!metatype || !this.validateMetaType(metatype)) {
			return queryContractDataDto
		}

		try {
			queryContractDataDto.address = this.tonBlockchainProvider.normalizeAddress(
				queryContractDataDto.address,
			)
		} catch (err: unknown) {
			throw new BadRequestException(`Invalid address is specified`)
		}

		return queryContractDataDto
	}

	private validateMetaType(metatype: any): boolean {
		const types = [String, Boolean, Number, Array, Object]
		return !types.includes(metatype)
	}
}
