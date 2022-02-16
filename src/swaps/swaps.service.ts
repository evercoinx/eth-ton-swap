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
import { SwapAmounts } from "./interfaces/swap-amounts"

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
		const { grossSourceAmount, fee, destinationAmount } = this.calculateSwapAmounts(
			createSwapDto.sourceAmount,
			sourceToken,
			destinationToken,
		)

		const swap = new Swap()
		swap.sourceToken = sourceToken
		swap.sourceAmount = this.formatAmount(grossSourceAmount, sourceToken)
		swap.destinationToken = destinationToken
		swap.destinationAddress = createSwapDto.destinationAddress
		swap.destinationAmount = this.formatAmount(destinationAmount, destinationToken)
		swap.fee = this.formatAmount(fee, sourceToken)
		swap.wallet = wallet
		swap.orderedAt = new Date(createSwapDto.orderedAt)

		return this.swapsRepository.save(swap)
	}

	async update(
		updateSwapDto: UpdateSwapDto,
		sourceToken?: Token,
		destinationToken?: Token,
	): Promise<void> {
		await this.swapsRepository.update(updateSwapDto.id, {
			sourceAddress: updateSwapDto.sourceAddress,
			sourceAmount: sourceToken
				? this.formatAmount(updateSwapDto.sourceAmount, sourceToken)
				: undefined,
			destinationAmount: destinationToken
				? this.formatAmount(updateSwapDto.destinationAmount, destinationToken)
				: undefined,
			fee: sourceToken ? this.formatAmount(updateSwapDto.fee, sourceToken) : undefined,
			status: updateSwapDto.status,
		})
	}

	async findOne(id: string): Promise<Swap | undefined> {
		return this.swapsRepository.findOne(id, {
			relations: ["sourceToken", "destinationToken", "wallet"],
		})
	}

	calculateSwapAmounts(
		sourceAmount: string,
		sourceToken: Token,
		destinationToken: Token,
	): SwapAmounts {
		const grossSourceAmount = new BigNumber(sourceAmount)
		const fee = grossSourceAmount.times(this.configService.get<number>("bridge.feePercent"))
		const netSourceAmount = grossSourceAmount.minus(fee)

		const ratio = new BigNumber(sourceToken.price).div(destinationToken.price)
		const destinationAmount = netSourceAmount.times(ratio)

		return {
			grossSourceAmount,
			netSourceAmount,
			destinationAmount,
			fee,
		}
	}

	private formatAmount(amount: string | BigNumber | undefined, token: Token) {
		if (typeof amount === "undefined") {
			return
		}
		return new BigNumber(amount).toFormat(token.decimals, BigNumber.ROUND_DOWN)
	}
}
