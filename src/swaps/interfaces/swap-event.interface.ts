import { SwapStatus } from "../enums/swap-status.enum"

export interface SwapEvent {
	status: SwapStatus
	currentConfirmations: number
	totalConfirmations: number
}
