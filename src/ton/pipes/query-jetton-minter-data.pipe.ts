import { ArgumentMetadata, Injectable, PipeTransform } from "@nestjs/common"
import { ERROR_INVALID_ADDRESS } from "src/common/constants"
import { BadRequestException } from "src/common/exceptions/bad-request.exception"
import { TonBlockchainService } from "src/ton/providers/ton-blockchain.service"
import { QueryJettonMinterDataDto } from "../dto/query-jetton-minter-data.dto"

@Injectable()
export class QueryJettonMinterDataPipe implements PipeTransform<any> {
	constructor(private readonly tonBlockchainService: TonBlockchainService) {}

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

	private validateMetaType(metatype: any): boolean {
		const types = [String, Boolean, Number, Array, Object]
		return !types.includes(metatype)
	}
}
