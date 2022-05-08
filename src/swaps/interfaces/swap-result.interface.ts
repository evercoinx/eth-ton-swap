import { ERROR_MESSAGE_TO_STATUS_CODE } from "src/common/constants"
import { SwapStatus } from "../enums/swap-status.enum"

export interface SwapResult {
	status: SwapStatus
	statusCode: number
	transactionId?: string
}

export function toSwapResult(
	status: SwapStatus,
	errorMessage?: string,
	transactionId?: string,
): SwapResult {
	return {
		status,
		statusCode: ERROR_MESSAGE_TO_STATUS_CODE[errorMessage || "No error"],
		transactionId,
	}
}
