import { SwapStatus } from "../swap.entity"

export interface SwapEvent {
	id: string
	status: SwapStatus
	confirmedBlockCount: number
	totalBlockCount: number
	createdAt: number
}
