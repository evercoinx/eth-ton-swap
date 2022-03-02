import { Injectable } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { InjectRepository } from "@nestjs/typeorm"
import { BigNumber } from "bignumber.js"
import { Repository } from "typeorm"
import { Token } from "src/tokens/token.entity"
import { Wallet } from "src/wallets/wallet.entity"
import { CreateSwapDto } from "./dto/create-swap.dto"
import { UpdateSwapDto } from "./dto/update-swap.dto"
import { SwapAmounts } from "./interfaces/swap-amounts.interface"
import { Swap } from "./swap.entity"

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
		sourceWallet: Wallet,
		destinationWallet: Wallet,
	): Promise<Swap> {
		const { destinationAmount, fee } = this.calculateSwapAmounts(
			createSwapDto.sourceAmount,
			sourceToken,
			destinationToken,
		)

		const swap = new Swap()
		swap.sourceToken = sourceToken
		swap.sourceAmount = this.formatAmount(createSwapDto.sourceAmount, sourceToken)
		swap.destinationToken = destinationToken
		swap.destinationAddress = createSwapDto.destinationAddress
		swap.destinationAmount = this.formatAmount(destinationAmount, destinationToken)
		swap.fee = this.formatAmount(fee, sourceToken)
		swap.sourceWallet = sourceWallet
		swap.destinationWallet = destinationWallet
		swap.orderedAt = new Date(createSwapDto.orderedAt)

		return this.swapsRepository.save(swap)
	}

	async update(
		updateSwapDto: UpdateSwapDto,
		sourceToken: Token,
		destinationToken: Token,
	): Promise<void> {
		await this.swapsRepository.update(updateSwapDto.id, {
			sourceAddress: updateSwapDto.sourceAddress,
			sourceAmount: this.formatAmount(updateSwapDto.sourceAmount, sourceToken),
			destinationAmount: this.formatAmount(updateSwapDto.destinationAmount, destinationToken),
			fee: this.formatAmount(updateSwapDto.fee, sourceToken),
			status: updateSwapDto.status,
			confirmedBlockCount: updateSwapDto.confirmedBlockCount || 0,
		})
	}

	async findOne(id: string): Promise<Swap | undefined> {
		return this.swapsRepository.findOne(id, {
			relations: ["sourceToken", "destinationToken", "sourceWallet", "destinationWallet"],
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
			netSourceAmount: this.formatAmount(netSourceAmount, sourceToken),
			destinationAmount: this.formatAmount(destinationAmount, destinationToken),
			fee: this.formatAmount(fee, sourceToken),
		}
	}

	private formatAmount(amount: string | BigNumber, token: Token): string {
		return new BigNumber(amount).toFixed(token.decimals, BigNumber.ROUND_DOWN)
	}
}
