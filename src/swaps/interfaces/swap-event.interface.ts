import { SwapStatus } from "../swap.entity"

export interface SwapEvent {
	id: string
	status: SwapStatus
	currentConfirmations: number
	totalConfirmations: number
	createdAt: number
}
