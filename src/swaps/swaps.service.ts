import { Injectable } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { InjectRepository } from "@nestjs/typeorm"
import { BigNumber } from "bignumber.js"
import { Repository } from "typeorm"
import { CreateSwapDto } from "./dto/create-swap.dto"
import { Swap } from "./swap.entity"
import { Token } from "src/tokens/token.entity"
import { Wallet } from "src/wallets/wallet.entity"
import { UpdateSwapDto } from "./dto/update-swap.dto"

@Injectable()
export class SwapsService {
	constructor(
		@InjectRepository(Swap)
		private readonly swapsRepository: Repository<Swap>,
		private readonly configService: ConfigService,
	) {}

	async create(
		createSwapDto: CreateSwapDto,
		sourceToken: Token,
		destinationToken: Token,
		wallet: Wallet,
	): Promise<Swap> {
		const grossSourceAmount = new BigNumber(createSwapDto.sourceAmount)
		const fee = grossSourceAmount.times(this.configService.get<number>("bridge.feePercent"))
		const netSourceAmount = grossSourceAmount.minus(fee)

		const ratio = new BigNumber(sourceToken.price).div(destinationToken.price)
		const destinationAmount = netSourceAmount.times(ratio)

		const swap = new Swap()
		swap.sourceToken = sourceToken
		swap.sourceAmount = grossSourceAmount.toFormat(sourceToken.decimals, BigNumber.ROUND_DOWN)
		swap.fee = fee.toFormat(sourceToken.decimals, BigNumber.ROUND_DOWN)
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

	async update(updateSwapDto: UpdateSwapDto): Promise<void> {
		await this.swapsRepository.update(updateSwapDto.id, {
			sourceAddress: updateSwapDto.sourceAddress,
			status: updateSwapDto.status,
		})
	}

	async findOne(id: string): Promise<Swap | undefined> {
		return this.swapsRepository.findOne(id, {
			relations: ["sourceToken", "destinationToken", "wallet"],
		})
	}
}
