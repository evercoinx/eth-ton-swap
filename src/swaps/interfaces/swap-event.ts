import { SwapStatus } from "../swap.entity"

interface SwapEventSuccess {
	status: SwapStatus
	currentBlockCount: number
	totalBlockCount: number
}

interface SwapEventError {
	status: SwapStatus
	error: string
}

export type SwapEvent = SwapEventSuccess | SwapEventError
