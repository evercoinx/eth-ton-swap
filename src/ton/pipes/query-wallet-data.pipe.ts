import { ArgumentMetadata, BadRequestException, Injectable, PipeTransform } from "@nestjs/common"
import { ERROR_INVALID_ADDRESS } from "src/common/constants"
import { TonBlockchainService } from "src/ton/providers/ton-blockchain.service"
import { QueryWalletDataDto } from "../dto/query-wallet-data.dto"

@Injectable()
export class QueryWalletDataPipe implements PipeTransform<any> {
	constructor(private readonly tonBlockchainService: TonBlockchainService) {}

	async transform(queryWalletDataDto: QueryWalletDataDto, { metatype }: ArgumentMetadata) {
		if (!metatype || !this.validateMetaType(metatype)) {
			return queryWalletDataDto
		}

		try {
			queryWalletDataDto.address = this.tonBlockchainService.normalizeAddress(
				queryWalletDataDto.address,
			)
		} catch (err: unknown) {
			throw new BadRequestException(ERROR_INVALID_ADDRESS)
		}

		return queryWalletDataDto
	}

	private validateMetaType(metatype: any): boolean {
		const types = [String, Boolean, Number, Array, Object]
		return !types.includes(metatype)
	}
}
