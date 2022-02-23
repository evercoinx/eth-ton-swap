import { SwapStatus } from "../swap.entity"

export interface SwapEvent {
	swapId: string
	status: SwapStatus
	confirmedBlockCount: number
	totalBlockCount: number
	updatedAt: number
}
