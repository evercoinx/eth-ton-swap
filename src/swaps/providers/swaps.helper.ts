import { Injectable, Logger } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import BigNumber from "bignumber.js"
import { ERROR_MESSAGE_TO_STATUS_CODE } from "src/common/constants"
import { WalletsRepository } from "src/wallets/providers/wallets.repository"
import { SwapStatus } from "../enums/swap-status.enum"
import { SwapResult } from "../interfaces/swap-result.interface"
import { Swap } from "../swap.entity"
import { SwapsRepository } from "./swaps.repository"

@Injectable()
export class SwapsHelper {
	constructor(
		private readonly configService: ConfigService,
		private readonly swapsRepository: SwapsRepository,
		private readonly walletsRepository: WalletsRepository,
	) {}

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

	swapNotFound(swapId: string, logger: Logger): SwapResult {
		logger.error(`${swapId}: Swap not found`)
		return this.toSwapResult(SwapStatus.Failed, "Swap not found")
	}

	async swapCanceled(swap: Swap, logger: Logger): Promise<SwapResult> {
		const result = this.toSwapResult(SwapStatus.Canceled)
		await this.swapsRepository.update(swap.id, { statusCode: result.statusCode })

		await this.walletsRepository.update(swap.sourceWallet.id, { inUse: false })

		logger.warn(`${swap.id}: Swap canceled`)
		return result
	}

	async swapExpired(swap: Swap, logger: Logger): Promise<SwapResult> {
		const result = this.toSwapResult(SwapStatus.Expired, "Swap expired")
		await this.swapsRepository.update(swap.id, {
			status: result.status,
			statusCode: result.statusCode,
		})

		await this.walletsRepository.update(swap.sourceWallet.id, { inUse: false })

		logger.error(`${swap.id}: Swap expired`)
		return result
	}

	async swapNotRecalculated(swap: Swap, err: Error, logger: Logger): Promise<SwapResult> {
		const result = this.toSwapResult(SwapStatus.Failed, `Swap not recalculated: ${err.message}`)
		await this.swapsRepository.update(swap.id, {
			status: result.status,
			statusCode: result.statusCode,
		})

		await this.walletsRepository.update(swap.sourceWallet.id, { inUse: false })

		logger.error(`${swap.id}: Swap not recalculated: ${err}`)
		return result
	}

	async jettonMinterAdminWalletNotFound(swap: Swap, logger: Logger): Promise<SwapResult> {
		const result = this.toSwapResult(SwapStatus.Failed, "Jetton minter admin wallet not found")
		await this.swapsRepository.update(swap.id, {
			status: result.status,
			statusCode: result.statusCode,
		})

		await this.walletsRepository.update(swap.sourceWallet.id, { inUse: false })

		logger.error(`${swap.id}: Jetton minter admin wallet not found`)
		return result
	}

	toSwapResult(status: SwapStatus, errorMessage?: string, transactionId?: string): SwapResult {
		return {
			status,
			statusCode: ERROR_MESSAGE_TO_STATUS_CODE[errorMessage || "No error"],
			transactionId,
		}
	}
}
