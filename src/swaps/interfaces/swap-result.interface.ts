import { SwapStatus } from "../enums/swap-status.enum"

export interface SwapResult {
	status: SwapStatus
	statusCode: number
	transactionId?: string
}
