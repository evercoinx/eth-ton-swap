import { Injectable } from "@nestjs/common"
import { InjectRepository } from "@nestjs/typeorm"
import { Blockchain } from "src/wallets/wallet.entity"
import { Repository } from "typeorm"
import { Fee } from "./fee.entity"
import { CreateFeeDto } from "./dto/create-fee.dto"

@Injectable()
export class FeesService {
	constructor(
		@InjectRepository(Fee)
		private readonly feeRepository: Repository<Fee>,
	) {}

	async update(createFeeDto: CreateFeeDto): Promise<void> {
		const fee = new Fee()
		fee.blockchain = createFeeDto.blockchain
		fee.maxFeePerGas = createFeeDto.maxFeePerGas
		fee.maxPriorityFeePerGas = createFeeDto.maxPriorityFeePerGas
		fee.gasPrice = createFeeDto.gasPrice
		fee.updatedAt = new Date()

		await this.feeRepository.upsert(fee, ["blockchain"])
	}

	async findOne(blockchain: Blockchain): Promise<Fee | undefined> {
		return this.feeRepository.findOne({ blockchain })
	}
}
