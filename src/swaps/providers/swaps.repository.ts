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
import { getAllSwapStatuses, SwapStatus } from "../enums/swap-status.enum"
import { Swap } from "../swap.entity"

@Injectable()
export class SwapsRepository {
	constructor(@InjectRepository(Swap) private readonly repository: Repository<Swap>) {}

	async create(
		createSwapDto: CreateSwapDto,
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

		return this.repository.save(swap)
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

	async count(ipAddress: string, status: SwapStatus): Promise<number> {
		return this.repository.count({
			where: {
				ipAddress,
				status,
			},
		})
	}

	async countStats(tokenAddress: string): Promise<Record<string, number>> {
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
