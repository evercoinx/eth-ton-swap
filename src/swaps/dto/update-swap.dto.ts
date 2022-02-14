import { SwapStatus } from "../swap.entity"

export class UpdateSwapDto {
	id: string
	sourceAddress?: string
	status: SwapStatus
}
