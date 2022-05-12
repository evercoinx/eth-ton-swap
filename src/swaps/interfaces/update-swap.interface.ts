import { Quantity } from "src/common/providers/quantity"
import { SwapStatus } from "../enums/swap-status.enum"

export interface UpdateSwap {
	sourceAddress?: string
	sourceAmount?: Quantity
	sourceTokenDecimals?: number
	sourceConjugatedAddress?: string
	sourceTransactionId?: string
	destinationConjugatedAddress?: string
	destinationAmount?: Quantity
	destinationTokenDecimals?: number
	destinationTransactionId?: string
	fee?: Quantity
	collectorTransactionId?: string
	burnTransactionId?: string
	status?: SwapStatus
	statusCode?: number
	confirmations?: number
}
