import { SwapStatus } from "../enums/swap-status.enum"

export interface SwapEvent {
	id: string
	status: SwapStatus
	currentConfirmations: number
	totalConfirmations: number
	createdAt: number
}
