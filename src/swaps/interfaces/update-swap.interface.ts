import BigNumber from "bignumber.js"
import { SwapStatus } from "../enums/swap-status.enum"

export interface UpdateSwap {
	sourceAddress?: string
	sourceAmount?: BigNumber
	sourceTokenDecimals?: number
	sourceConjugatedAddress?: string
	sourceTransactionId?: string
	destinationConjugatedAddress?: string
	destinationAmount?: BigNumber
	destinationTokenDecimals?: number
	destinationTransactionId?: string
	fee?: BigNumber
	collectorTransactionId?: string
	burnTransactionId?: string
	status?: SwapStatus
	statusCode?: number
	confirmations?: number
}
