import { Injectable } from "@nestjs/common"
import { InjectRepository } from "@nestjs/typeorm"
import { Repository } from "typeorm"
import { Blockchain } from "src/tokens/token.entity"
import { UpsertFeeDto } from "./dto/upsert-fee.dto"
import { Fee } from "./fee.entity"

@Injectable()
export class FeesService {
	constructor(@InjectRepository(Fee) private readonly feeRepository: Repository<Fee>) {}

	async upsert(upsertFeeDto: UpsertFeeDto): Promise<void> {
		const fee = new Fee()
		fee.blockchain = upsertFeeDto.blockchain
		fee.gasFee = upsertFeeDto.gasFee
		fee.updatedAt = new Date()

		await this.feeRepository.upsert(fee, ["blockchain"])
	}

	async findByBlockchain(blockchain: Blockchain): Promise<Fee | undefined> {
		return this.feeRepository.findOne({ blockchain })
	}
}
