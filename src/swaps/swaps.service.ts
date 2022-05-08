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
import { getAllSwapStatuses, SwapStatus } from "./enums/swap-status.enum"
import { Swap } from "./swap.entity"

@Injectable()
export class SwapsService {
	constructor(
		@InjectRepository(Swap) private readonly swapRepository: Repository<Swap>,
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
		swap.sourceAmount = new BigNumber(createSwapDto.sourceAmount).toFixed(sourceToken.decimals)
		swap.destinationToken = destinationToken
		swap.destinationAddress = createSwapDto.destinationAddress
		swap.destinationAmount = new BigNumber(destinationAmount).toFixed(destinationToken.decimals)
		swap.fee = new BigNumber(fee).toFixed(sourceToken.decimals)
		swap.sourceWallet = sourceWallet
		swap.destinationWallet = destinationWallet
		swap.collectorWallet = collectorWallet
		swap.ipAddress = ipAddress
		swap.orderedAt = new Date(createSwapDto.orderedAt)
		swap.expiresAt = new Date(createSwapDto.orderedAt + SWAP_EXPIRATION_INTERVAL)

		return this.swapRepository.save(swap)
	}

	async update(
		id: string,
		updateSwapDto: UpdateSwapDto,
		sourceTokenDecimals = 0,
		destinationTokenDecimals = 0,
	): Promise<void> {
		const partialSwap: QueryDeepPartialEntity<Swap> = {}
		if (updateSwapDto.sourceAddress !== undefined) {
			partialSwap.sourceAddress = updateSwapDto.sourceAddress
		}
		if (updateSwapDto.sourceAmount !== undefined) {
			partialSwap.sourceAmount = new BigNumber(updateSwapDto.sourceAmount).toFixed(
				sourceTokenDecimals,
			)
		}
		if (updateSwapDto.sourceConjugatedAddress !== undefined) {
			partialSwap.sourceConjugatedAddress = updateSwapDto.sourceConjugatedAddress
		}
		if (updateSwapDto.sourceTransactionId !== undefined) {
			partialSwap.sourceTransactionId = updateSwapDto.sourceTransactionId
		}
		if (updateSwapDto.destinationConjugatedAddress !== undefined) {
			partialSwap.destinationConjugatedAddress = updateSwapDto.destinationConjugatedAddress
		}
		if (updateSwapDto.destinationAmount !== undefined) {
			partialSwap.destinationAmount = new BigNumber(updateSwapDto.destinationAmount).toFixed(
				destinationTokenDecimals,
			)
		}
		if (updateSwapDto.destinationTransactionId !== undefined) {
			partialSwap.destinationTransactionId = updateSwapDto.destinationTransactionId
		}
		if (updateSwapDto.fee !== undefined) {
			partialSwap.fee = new BigNumber(updateSwapDto.fee).toFixed(sourceTokenDecimals)
		}
		if (updateSwapDto.collectorTransactionId !== undefined) {
			partialSwap.collectorTransactionId = updateSwapDto.collectorTransactionId
		}
		if (updateSwapDto.burnTransactionId !== undefined) {
			partialSwap.burnTransactionId = updateSwapDto.burnTransactionId
		}
		if (updateSwapDto.status !== undefined) {
			partialSwap.status = updateSwapDto.status
		}
		if (updateSwapDto.statusCode !== undefined) {
			partialSwap.statusCode = updateSwapDto.statusCode
		}
		if (updateSwapDto.confirmations !== undefined) {
			partialSwap.confirmations = updateSwapDto.confirmations
		}

		await this.swapRepository.update(id, partialSwap)
	}

	async findById(id: string): Promise<Swap | null> {
		return this.swapRepository.findOne({
			where: { id },
			relations: [
				"sourceToken",
				"destinationToken",
				"sourceWallet",
				"destinationWallet",
				"collectorWallet",
			],
		})
	}

	async count(ipAddress: string, status: SwapStatus): Promise<number> {
		return this.swapRepository.count({
			where: {
				ipAddress,
				status,
			},
		})
	}

	async countStats(tokenAddress: string): Promise<Record<string, number>> {
		const stats: Record<string, number> = {}

		for (const status of getAllSwapStatuses()) {
			stats[status] = await this.swapRepository.count({
				where: {
					sourceToken: { address: tokenAddress },
					status,
				},
			})
		}
		return stats
	}

	recalculateSwap(swap: Swap, sourceAmount: BigNumber): Swap {
		const [destinationAmount, fee] = this.calculateDestinationAmountAndFee(sourceAmount)

		if (fee.lte(0)) {
			throw new Error("Zero fee")
		}
		if (destinationAmount.lte(0)) {
			throw new Error("Zero amount")
		}
		if (destinationAmount.lt(swap.destinationToken.minSwapAmount)) {
			throw new Error("Amount too low")
		}
		if (destinationAmount.gt(swap.destinationToken.maxSwapAmount)) {
			throw new Error("Amount too high")
		}

		swap.sourceAmount = sourceAmount.toFixed(swap.sourceToken.decimals)
		swap.destinationAmount = destinationAmount.toFixed(swap.destinationToken.decimals)
		swap.fee = fee.toFixed(swap.sourceToken.decimals)
		return swap
	}

	calculateDestinationAmountAndFee(sourceAmount: BigNumber): [BigNumber, BigNumber] {
		const swapFeePercent = this.configService.get<number>("bridge.swapFee")
		const fee = sourceAmount.times(swapFeePercent)
		const destinationAmount = sourceAmount.minus(fee)
		return [destinationAmount, fee]
	}
}
