import { Injectable, Logger } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import BigNumber from "bignumber.js"
import {
	ERROR_NO_ERROR,
	ERROR_SWAP_EXPIRED,
	ERROR_SWAP_NOT_FOUND,
	ERROR_SWAP_NOT_RECACULATED_TOO_HIGH,
	ERROR_SWAP_NOT_RECACULATED_TOO_LOW,
	ERROR_SWAP_NOT_RECACULATED_ZERO_AMOUNT,
	ERROR_SWAP_NOT_RECACULATED_ZERO_FEE,
	ERROR_JETTON_MINTER_ADMIN_WALLET_NOT_FOUND,
	getStatusCode,
} from "src/common/constants"
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
		private readonly configService: ConfigService,
	) {}

	recalculateSwap(swap: Swap, transferredAmount: BigNumber): Swap {
		if (transferredAmount.lte(0)) {
			throw new Error(ERROR_SWAP_NOT_RECACULATED_ZERO_AMOUNT)
		}
		if (transferredAmount.lt(swap.sourceToken.minSwapAmount)) {
			throw new Error(ERROR_SWAP_NOT_RECACULATED_TOO_LOW)
		}
		if (transferredAmount.gt(swap.sourceToken.maxSwapAmount)) {
			throw new Error(ERROR_SWAP_NOT_RECACULATED_TOO_HIGH)
		}

		const [destinationAmount, fee] = this.calculateDestinationAmountAndFee(transferredAmount)
		if (fee.lte(0)) {
			throw new Error(ERROR_SWAP_NOT_RECACULATED_ZERO_FEE)
		}

		swap.sourceAmount = transferredAmount.toFixed(swap.sourceToken.decimals)
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

	isSwapProcessable(status: SwapStatus): boolean {
		return ![SwapStatus.Expired, SwapStatus.Failed, SwapStatus.Canceled].includes(status)
	}

	swapNotFound(swapId: string, logger: Logger): SwapResult {
		logger.error(`${swapId}: ${ERROR_SWAP_NOT_FOUND}`)
		return {
			status: SwapStatus.Failed,
			statusCode: getStatusCode(ERROR_SWAP_NOT_FOUND),
		}
	}

	async swapCanceled(swap: Swap, logger: Logger): Promise<SwapResult> {
		const result: SwapResult = {
			status: SwapStatus.Canceled,
			statusCode: getStatusCode(ERROR_NO_ERROR),
		}
		await this.swapsRepository.update(swap.id, { statusCode: result.statusCode })

		await this.walletsRepository.update(swap.sourceWallet.id, { inUse: false })

		logger.warn(`${swap.id}: Swap canceled`)
		return result
	}

	async swapExpired(swap: Swap, logger: Logger): Promise<SwapResult> {
		const result: SwapResult = {
			status: SwapStatus.Expired,
			statusCode: getStatusCode(ERROR_SWAP_EXPIRED),
		}
		await this.swapsRepository.update(swap.id, {
			status: result.status,
			statusCode: result.statusCode,
		})

		await this.walletsRepository.update(swap.sourceWallet.id, { inUse: false })

		logger.error(`${swap.id}: ${ERROR_SWAP_EXPIRED}`)
		return result
	}

	async swapNotRecalculated(swap: Swap, err: Error, logger: Logger): Promise<SwapResult> {
		const result: SwapResult = {
			status: SwapStatus.Failed,
			statusCode: getStatusCode(err.message),
		}
		await this.swapsRepository.update(swap.id, {
			status: result.status,
			statusCode: result.statusCode,
		})

		await this.walletsRepository.update(swap.sourceWallet.id, { inUse: false })

		logger.error(`${swap.id}: ${err.message}`)
		return result
	}

	async jettonMinterAdminWalletNotFound(swap: Swap, logger: Logger): Promise<SwapResult> {
		const result: SwapResult = {
			status: SwapStatus.Failed,
			statusCode: getStatusCode(ERROR_JETTON_MINTER_ADMIN_WALLET_NOT_FOUND),
		}
		await this.swapsRepository.update(swap.id, {
			status: result.status,
			statusCode: result.statusCode,
		})

		await this.walletsRepository.update(swap.sourceWallet.id, { inUse: false })

		logger.error(`${swap.id}: ${ERROR_JETTON_MINTER_ADMIN_WALLET_NOT_FOUND}`)
		return result
	}
}
