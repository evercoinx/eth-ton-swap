import { ArgumentMetadata, BadRequestException, Injectable, PipeTransform } from "@nestjs/common"
import { ERROR_INVALID_ADDRESS } from "src/common/constants"
import { BaseValidationPipe } from "src/common/pipes/base-validation.pipe"
import { TonBlockchainService } from "src/ton/providers/ton-blockchain.service"
import { QueryJettonMinterDataDto } from "../dto/query-jetton-minter-data.dto"

@Injectable()
export class QueryJettonMinterDataPipe
	extends BaseValidationPipe
	implements PipeTransform<QueryJettonMinterDataDto, Promise<QueryJettonMinterDataDto>>
{
	constructor(private readonly tonBlockchainService: TonBlockchainService) {
		super()
	}

	async transform(
		queryJettonMinterDataDto: QueryJettonMinterDataDto,
		{ metatype }: ArgumentMetadata,
	) {
		if (!metatype || !this.validateMetaType(metatype)) {
			return queryJettonMinterDataDto
		}

		try {
			queryJettonMinterDataDto.address = this.tonBlockchainService.normalizeAddress(
				queryJettonMinterDataDto.address,
			)
		} catch (err: unknown) {
			throw new BadRequestException(ERROR_INVALID_ADDRESS)
		}

		return queryJettonMinterDataDto
	}
}
