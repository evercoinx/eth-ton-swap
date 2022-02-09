import { Injectable } from "@nestjs/common"
import { InjectRepository } from "@nestjs/typeorm"
import { Repository } from "typeorm"
import { CreateSwapDto } from "./dto/create-swap.dto"
import { Swap } from "./swap.entity"
import { Wallet } from "../wallets/wallet.entity"

@Injectable()
export class SwapsService {
	constructor(
		@InjectRepository(Swap)
		private readonly swapsRepository: Repository<Swap>,
	) {}

	async create(createSwapDto: CreateSwapDto, wallet: Wallet): Promise<Swap> {
		const swap = new Swap()
		swap.sourceBlockchain = createSwapDto.sourceBlockchain
		swap.sourceToken = createSwapDto.sourceToken
		swap.sourceAmount = createSwapDto.sourceAmount
		swap.destinationBlockchain = createSwapDto.destinationBlockchain
		swap.destinationAddress = createSwapDto.destinationAddress
		swap.destinationToken = createSwapDto.destinationToken
		swap.wallet = wallet
		swap.orderedAt = new Date(createSwapDto.orderedAt)

		return this.swapsRepository.save(swap)
	}

	async findOne(id: string): Promise<Swap> {
		return this.swapsRepository.findOne(id, { relations: ["wallet"] })
	}
}
