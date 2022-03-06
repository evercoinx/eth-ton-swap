import { SwapStatus } from "../swap.entity"

export class UpdateSwapDto {
	id: string
	sourceAddress?: string
	sourceAmount?: string
	sourceTransactionHash?: string
	destinationAmount?: string
	destinationTransactionHash?: string
	fee?: string
	collectorTransactionHash?: string
	status?: SwapStatus
	blockConfirmations?: number
}
