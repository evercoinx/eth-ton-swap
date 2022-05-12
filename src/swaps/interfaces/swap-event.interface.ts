import { SwapStatus } from "../enums/swap-status.enum"

export interface SwapEvent {
	id: string
	status: SwapStatus
	statusCode: number
	currentConfirmations: number
	totalConfirmations: number
}
