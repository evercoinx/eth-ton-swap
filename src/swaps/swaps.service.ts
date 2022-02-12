import { Injectable } from "@nestjs/common"
import { InjectRepository } from "@nestjs/typeorm"
import { Repository } from "typeorm"
import { CreateSwapDto } from "./dto/create-swap.dto"
import { Swap } from "./swap.entity"
import { Wallet } from "../wallets/wallet.entity"
import { Token } from "src/tokens/token.entity"

@Injectable()
export class SwapsService {
	constructor(
		@InjectRepository(Swap)
		private readonly swapsRepository: Repository<Swap>,
	) {}

	async create(
		createSwapDto: CreateSwapDto,
		quotePrice: number,
		sourceToken: Token,
		destinationToken: Token,
		wallet: Wallet,
	): Promise<Swap> {
		const detinationAmount = Math.floor(parseInt(createSwapDto.sourceAmount, 10) * quotePrice)

		const swap = new Swap()
		swap.sourceToken = sourceToken
		swap.sourceAmount = createSwapDto.sourceAmount
		swap.destinationToken = destinationToken
		swap.destinationAddress = createSwapDto.destinationAddress
		swap.destinationAmount = detinationAmount.toString()
		swap.wallet = wallet
		swap.orderedAt = new Date(createSwapDto.orderedAt)

		return this.swapsRepository.save(swap)
	}

	async findOne(id: string): Promise<Swap | undefined> {
		return this.swapsRepository.findOne(id, {
			relations: ["sourceToken", "destinationToken", "wallet"],
		})
	}
}
