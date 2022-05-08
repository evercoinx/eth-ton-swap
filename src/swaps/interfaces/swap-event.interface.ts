import { SwapStatus } from "../enums/swap-status.enum"

export interface SwapEvent {
	status: SwapStatus
	statusCode: number
	currentConfirmations: number
	totalConfirmations: number
}
