import { Injectable, Logger } from "@nestjs/common"
import { ERROR_MESSAGE_TO_STATUS_CODE } from "src/common/constants"
import { WalletsRepository } from "src/wallets/providers/wallets.repository"
import { SwapStatus } from "../enums/swap-status.enum"
import { SwapResult } from "../interfaces/swap-result.interface"
import { Swap } from "../swap.entity"
import { SwapsRepository } from "./swaps.repository"

@Injectable()
export class SwapsHelper {
	constructor(
		private readonly swapsRepository: SwapsRepository,
		private readonly walletsRepository: WalletsRepository,
	) {}

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
