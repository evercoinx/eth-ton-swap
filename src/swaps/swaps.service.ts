import { Injectable } from "@nestjs/common"
import { InjectRepository } from "@nestjs/typeorm"
import { Repository } from "typeorm"
import { CreateSwapDto } from "./dto/create-swap.dto"
import { Swap } from "./swap.entity"

@Injectable()
export class SwapsService {
	constructor(
		@InjectRepository(Swap)
		private readonly swapsRepository: Repository<Swap>,
	) {}

	async create(createSwapDto: CreateSwapDto): Promise<Swap> {
		const swap = new Swap()
		swap.sourceBlockchain = createSwapDto.sourceBlockchain
		swap.sourceAddress = createSwapDto.sourceAddress
		swap.sourceAmount = createSwapDto.sourceAmount
		swap.destinationBlockchain = createSwapDto.destinationBlockchain
		swap.destinationAddress = createSwapDto.destinationAddress
		swap.destinationAmount = createSwapDto.destinationAmount
		swap.createdAt = new Date(createSwapDto.createdAt)
		swap.registeredAt = new Date()

		return this.swapsRepository.save(swap)
	}

	async findOne(id: string): Promise<Swap> {
		return this.swapsRepository.findOne(id)
	}
}
