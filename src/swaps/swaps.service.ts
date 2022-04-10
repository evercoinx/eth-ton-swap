import { Injectable } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { InjectRepository } from "@nestjs/typeorm"
import { BigNumber } from "bignumber.js"
import { Repository } from "typeorm"
import { QueryDeepPartialEntity } from "typeorm/query-builder/QueryPartialEntity"
import { Token } from "src/tokens/token.entity"
import { Wallet } from "src/wallets/wallet.entity"
import { SWAP_EXPIRATION_INTERVAL } from "./constants"
import { CreateSwapDto } from "./dto/create-swap.dto"
import { UpdateSwapDto } from "./dto/update-swap.dto"
import { Swap, SwapStatus } from "./swap.entity"

@Injectable()
export class SwapsService {
	constructor(
		@InjectRepository(Swap) private readonly swapsRepository: Repository<Swap>,
		private readonly configService: ConfigService,
	) {}

	async create(
		createSwapDto: CreateSwapDto,
		destinationAmount: string,
		fee: string,
		sourceToken: Token,
		destinationToken: Token,
		sourceWallet: Wallet,
		destinationWallet: Wallet,
		collectorWallet: Wallet,
		ipAddress: string,
	): Promise<Swap> {
		const swap = new Swap()
		swap.sourceToken = sourceToken
		swap.sourceAmount = this.formatAmount(createSwapDto.sourceAmount, sourceToken)
		swap.destinationToken = destinationToken
		swap.destinationAddress = createSwapDto.destinationAddress
		swap.destinationAmount = this.formatAmount(destinationAmount, destinationToken)
		swap.fee = this.formatAmount(fee, sourceToken)
		swap.sourceWallet = sourceWallet
		swap.destinationWallet = destinationWallet
		swap.collectorWallet = collectorWallet
		swap.ipAddress = ipAddress
		swap.orderedAt = new Date(createSwapDto.orderedAt)
		swap.expiresAt = new Date(createSwapDto.orderedAt + SWAP_EXPIRATION_INTERVAL)

		return this.swapsRepository.save(swap)
	}

	async update(
		id: string,
		updateSwapDto: UpdateSwapDto,
		sourceToken: Token,
		destinationToken: Token,
	): Promise<void> {
		const partialSwap: QueryDeepPartialEntity<Swap> = {}
		if (updateSwapDto.sourceAddress !== undefined) {
			partialSwap.sourceAddress = updateSwapDto.sourceAddress
		}
		if (updateSwapDto.sourceAmount !== undefined) {
			partialSwap.sourceAmount = this.formatAmount(updateSwapDto.sourceAmount, sourceToken)
		}
		if (updateSwapDto.sourceTransactionId !== undefined) {
			partialSwap.sourceTransactionId = updateSwapDto.sourceTransactionId
		}
		if (updateSwapDto.destinationConjugatedAddress !== undefined) {
			partialSwap.destinationConjugatedAddress = updateSwapDto.destinationConjugatedAddress
		}
		if (updateSwapDto.destinationAmount !== undefined) {
			partialSwap.destinationAmount = this.formatAmount(
				updateSwapDto.destinationAmount,
				destinationToken,
			)
		}
		if (updateSwapDto.destinationTransactionId !== undefined) {
			partialSwap.destinationTransactionId = updateSwapDto.destinationTransactionId
		}
		if (updateSwapDto.fee !== undefined) {
			partialSwap.fee = this.formatAmount(updateSwapDto.fee, sourceToken)
		}
		if (updateSwapDto.collectorTransactionId !== undefined) {
			partialSwap.collectorTransactionId = updateSwapDto.collectorTransactionId
		}
		if (updateSwapDto.status !== undefined) {
			partialSwap.status = updateSwapDto.status
		}
		if (updateSwapDto.confirmations !== undefined) {
			partialSwap.confirmations = updateSwapDto.confirmations
		}

		await this.swapsRepository.update(id, partialSwap)
	}

	async findById(id: string): Promise<Swap | undefined> {
		return this.swapsRepository.findOne(id, {
			relations: [
				"sourceToken",
				"destinationToken",
				"sourceWallet",
				"destinationWallet",
				"collectorWallet",
			],
		})
	}

	async countByIpAddress(ipAddress: string, status: SwapStatus): Promise<number> {
		return this.swapsRepository.count({
			where: {
				ipAddress,
				status,
			},
		})
	}

	calculateDestinationAmountAndFee(
		sourceAmount: string,
		sourceToken: Token,
		destinationToken: Token,
	): [string, string] {
		const grossSourceAmount = new BigNumber(sourceAmount)
		const feePercent = this.configService.get<number>("bridge.feePercent")
		const fee = grossSourceAmount.times(feePercent)
		const netSourceAmount = grossSourceAmount.minus(fee)

		// const ratio = new BigNumber(sourceToken.price).div(destinationToken.price)
		const ratio = 1
		const destinationAmount = netSourceAmount.times(ratio)

		return [
			this.formatAmount(destinationAmount, destinationToken),
			this.formatAmount(fee, sourceToken),
		]
	}

	private formatAmount(amount: string | BigNumber, token: Token): string {
		return new BigNumber(amount)
			.toFixed(token.decimals, BigNumber.ROUND_DOWN)
			.replace(/0+$/, "")
	}
}
