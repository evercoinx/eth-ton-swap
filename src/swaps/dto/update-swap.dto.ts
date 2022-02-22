import { SwapStatus } from "../swap.entity"

export class UpdateSwapDto {
	id: string
	sourceAddress?: string
	sourceAmount: string
	destinationAmount: string
	fee: string
	status: SwapStatus
	confirmationCount?: number
}
