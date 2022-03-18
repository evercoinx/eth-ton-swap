import { Injectable } from "@nestjs/common"
import { InjectRepository } from "@nestjs/typeorm"
import BigNumber from "bignumber.js"
import { formatEther } from "nestjs-ethers"
import { Repository } from "typeorm"
import { Blockchain } from "src/tokens/token.entity"
import { ERC20_TOKEN_TRANSFER_GAS_LIMIT } from "./contstants"
import { CreateFeeDto } from "./dto/create-fee.dto"
import { Fee } from "./fee.entity"

@Injectable()
export class FeesService {
	constructor(
		@InjectRepository(Fee)
		private readonly feeRepository: Repository<Fee>,
	) {}

	async update(createFeeDto: CreateFeeDto): Promise<void> {
		const gasFee = new BigNumber(createFeeDto.maxFeePerGas).times(
			ERC20_TOKEN_TRANSFER_GAS_LIMIT,
		)

		const fee = new Fee()
		fee.blockchain = createFeeDto.blockchain
		fee.gasFee = formatEther(gasFee.toString())
		fee.updatedAt = new Date()

		await this.feeRepository.upsert(fee, ["blockchain"])
	}

	async findOne(blockchain: Blockchain): Promise<Fee | undefined> {
		return this.feeRepository.findOne({ blockchain })
	}
}
