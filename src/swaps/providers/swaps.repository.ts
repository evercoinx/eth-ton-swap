import { Injectable } from "@nestjs/common"
import { InjectRepository } from "@nestjs/typeorm"
import { Repository } from "typeorm"
import { QueryDeepPartialEntity } from "typeorm/query-builder/QueryPartialEntity"
import { SWAP_EXPIRATION_INTERVAL } from "../constants"
import { getAllSwapStatuses } from "../enums/swap-status.enum"
import { CountSwaps } from "../interfaces/count-swaps.interface"
import { CreateSwap } from "../interfaces/create-swap.interface"
import { CountSwapsStats } from "../interfaces/count-swaps-stats.interface"
import { UpdateSwap } from "../interfaces/update-swap.interface"
import { Swap } from "../swap.entity"

@Injectable()
export class SwapsRepository {
	constructor(@InjectRepository(Swap) private readonly repository: Repository<Swap>) {}

	async create({
		sourceAmount,
		sourceToken,
		sourceWallet,
		destinationAddress,
		destinationAmount,
		destinationToken,
		destinationWallet,
		fee,
		collectorWallet,
		ipAddress,
		orderedAt,
	}: CreateSwap): Promise<Swap> {
		const swap = new Swap()
		swap.sourceAmount = sourceAmount.toString()
		swap.sourceToken = sourceToken
		swap.sourceWallet = sourceWallet
		swap.destinationAddress = destinationAddress
		swap.destinationAmount = destinationAmount.toString()
		swap.destinationToken = destinationToken
		swap.destinationWallet = destinationWallet
		swap.fee = fee.toString()
		swap.collectorWallet = collectorWallet
		swap.ipAddress = ipAddress
		swap.orderedAt = orderedAt
		swap.expiresAt = new Date(orderedAt.getTime() + SWAP_EXPIRATION_INTERVAL)

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
		}: UpdateSwap,
	): Promise<void> {
		const partialSwap: QueryDeepPartialEntity<Swap> = {}
		if (sourceAddress !== undefined) {
			partialSwap.sourceAddress = sourceAddress
		}
		if (sourceAmount !== undefined) {
			partialSwap.sourceAmount = sourceAmount.toString()
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
			partialSwap.destinationAmount = destinationAmount.toString()
		}
		if (destinationTransactionId !== undefined) {
			partialSwap.destinationTransactionId = destinationTransactionId
		}
		if (fee !== undefined) {
			partialSwap.fee = fee.toString()
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
