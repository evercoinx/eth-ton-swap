import { ArgumentMetadata, BadRequestException, Injectable, PipeTransform } from "@nestjs/common"
import { ERROR_INVALID_ADDRESS } from "src/common/constants"
import { BaseValidationPipe } from "src/common/pipes/base-validation.pipe"
import { TonBlockchainService } from "src/ton/providers/ton-blockchain.service"
import { QueryWalletDataDto } from "../dto/query-wallet-data.dto"

@Injectable()
export class QueryWalletDataPipe
	extends BaseValidationPipe
	implements PipeTransform<QueryWalletDataDto, Promise<QueryWalletDataDto>>
{
	constructor(private readonly tonBlockchainService: TonBlockchainService) {
		super()
	}

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
}
