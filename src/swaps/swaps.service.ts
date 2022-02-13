import { Injectable } from "@nestjs/common"
import { InjectRepository } from "@nestjs/typeorm"
import { BigNumber } from "bignumber.js"
import { Repository } from "typeorm"
import { CreateSwapDto } from "./dto/create-swap.dto"
import { Swap } from "./swap.entity"
import { Token } from "src/tokens/token.entity"
import { Wallet } from "src/wallets/wallet.entity"

@Injectable()
export class SwapsService {
	constructor(
		@InjectRepository(Swap)
		private readonly swapsRepository: Repository<Swap>,
	) {}

	async create(
		createSwapDto: CreateSwapDto,
		sourceToken: Token,
		destinationToken: Token,
		wallet: Wallet,
	): Promise<Swap> {
		const ratio = sourceToken.price / destinationToken.price
		const sourceAmount = new BigNumber(createSwapDto.sourceAmount)
		const destinationAmount = sourceAmount.times(ratio)

		const swap = new Swap()
		swap.sourceToken = sourceToken
		swap.sourceAmount = sourceAmount.toFormat(sourceToken.decimals, BigNumber.ROUND_DOWN)
		swap.destinationToken = destinationToken
		swap.destinationAddress = createSwapDto.destinationAddress
		swap.destinationAmount = destinationAmount.toFormat(
			destinationToken.decimals,
			BigNumber.ROUND_DOWN,
		)
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
