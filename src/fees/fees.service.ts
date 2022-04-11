import { Injectable } from "@nestjs/common"
import { InjectRepository } from "@nestjs/typeorm"
import BigNumber from "bignumber.js"
import { Repository } from "typeorm"
import { ERC20_TOKEN_TRANSFER_GAS_LIMIT } from "src/common/constants"
import { Blockchain } from "src/tokens/token.entity"
import { UpsertFeeDto } from "./dto/upsert-fee.dto"
import { Fee } from "./fee.entity"

@Injectable()
export class FeesService {
	constructor(@InjectRepository(Fee) private readonly feeRepository: Repository<Fee>) {}

	async upsert(upsertFeeDto: UpsertFeeDto): Promise<void> {
		const gasFee = new BigNumber(upsertFeeDto.maxFeePerGas).times(
			ERC20_TOKEN_TRANSFER_GAS_LIMIT,
		)

		const fee = new Fee()
		fee.blockchain = upsertFeeDto.blockchain
		fee.gasFee = gasFee.toString()
		fee.updatedAt = new Date()

		await this.feeRepository.upsert(fee, ["blockchain"])
	}

	async findByBlockchain(blockchain: Blockchain): Promise<Fee | undefined> {
		return this.feeRepository.findOne({ blockchain })
	}
}
