import { Injectable } from "@nestjs/common"
import { InjectRepository } from "@nestjs/typeorm"
import { BigNumber } from "bignumber.js"
import { Repository } from "typeorm"
import { QueryDeepPartialEntity } from "typeorm/query-builder/QueryPartialEntity"
import { Token } from "src/tokens/token.entity"
import { Wallet } from "src/wallets/wallet.entity"
import { SWAP_EXPIRATION_INTERVAL } from "../constants"
import { CreateSwapDto } from "../dto/create-swap.dto"
import { UpdateSwapDto } from "../dto/update-swap.dto"
import { getAllSwapStatuses } from "../enums/swap-status.enum"
import { CountSwaps } from "../interfaces/count-swaps.interface"
import { CountSwapsStats } from "../interfaces/count-swaps-stats.interface"
import { Swap } from "../swap.entity"

@Injectable()
export class SwapsRepository {
	constructor(@InjectRepository(Swap) private readonly repository: Repository<Swap>) {}

	async create(
		{ sourceAmount, destinationAddress, orderedAt }: CreateSwapDto,
		destinationAmount: string,
		fee: string,
		sourceToken: Token,
		destinationToken: Token,
		ipAddress: string,
		sourceWallet: Wallet,
		collectorWallet: Wallet,
		destinationWallet?: Wallet,
	): Promise<Swap> {
		const swap = new Swap()
		swap.sourceToken = sourceToken
		swap.sourceAmount = new BigNumber(sourceAmount).toFixed(sourceToken.decimals)
		swap.destinationToken = destinationToken
		swap.destinationAddress = destinationAddress
		swap.destinationAmount = new BigNumber(destinationAmount).toFixed(destinationToken.decimals)
		swap.fee = new BigNumber(fee).toFixed(sourceToken.decimals)
		swap.sourceWallet = sourceWallet
		swap.destinationWallet = destinationWallet
		swap.collectorWallet = collectorWallet
		swap.ipAddress = ipAddress
		swap.orderedAt = new Date(orderedAt)
		swap.expiresAt = new Date(orderedAt + SWAP_EXPIRATION_INTERVAL)

		return this.repository.save(swap)
	}

	async update(
		id: string,
		{
			sourceAddress,
			sourceAmount,
			sourceConjugatedAddress,
			sourceTransactionId,
			destinationAmount,
			destinationConjugatedAddress,
			destinationTransactionId,
			fee,
			collectorTransactionId,
			burnTransactionId,
			status,
			statusCode,
			confirmations,
		}: UpdateSwapDto,
		sourceTokenDecimals = 0,
		destinationTokenDecimals = 0,
	): Promise<void> {
		const partialSwap: QueryDeepPartialEntity<Swap> = {}
		if (sourceAddress !== undefined) {
			partialSwap.sourceAddress = sourceAddress
		}
		if (sourceAmount !== undefined) {
			partialSwap.sourceAmount = new BigNumber(sourceAmount).toFixed(sourceTokenDecimals)
		}
		if (sourceConjugatedAddress !== undefined) {
			partialSwap.sourceConjugatedAddress = sourceConjugatedAddress
		}
		if (sourceTransactionId !== undefined) {
			partialSwap.sourceTransactionId = sourceTransactionId
		}
		if (destinationConjugatedAddress !== undefined) {
			partialSwap.destinationConjugatedAddress = destinationConjugatedAddress
		}
		if (destinationAmount !== undefined) {
			partialSwap.destinationAmount = new BigNumber(destinationAmount).toFixed(
				destinationTokenDecimals,
			)
		}
		if (destinationTransactionId !== undefined) {
			partialSwap.destinationTransactionId = destinationTransactionId
		}
		if (fee !== undefined) {
			partialSwap.fee = new BigNumber(fee).toFixed(sourceTokenDecimals)
		}
		if (collectorTransactionId !== undefined) {
			partialSwap.collectorTransactionId = collectorTransactionId
		}
		if (burnTransactionId !== undefined) {
			partialSwap.burnTransactionId = burnTransactionId
		}
		if (status !== undefined) {
			partialSwap.status = status
		}
		if (statusCode !== undefined) {
			partialSwap.statusCode = statusCode
		}
		if (confirmations !== undefined) {
			partialSwap.confirmations = confirmations
		}

		await this.repository.update(id, partialSwap)
	}

	async findById(id: string): Promise<Swap | null> {
		return this.repository.findOne({
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

	async count({ ipAddress, status }: CountSwaps): Promise<number> {
		return this.repository.count({
			where: {
				ipAddress,
				status,
			},
		})
	}

	async countStats({ tokenAddress }: CountSwapsStats): Promise<Record<string, number>> {
		const stats: Record<string, number> = {}

		for (const status of getAllSwapStatuses()) {
			stats[status] = await this.repository.count({
				where: {
					sourceToken: { address: tokenAddress },
					status,
				},
			})
		}
		return stats
	}
}
