import { Blockchain } from "../swap.entity"

export class CreateSwapDto {
	sourceBlockchain: Blockchain
	sourceAddress: string
	sourceAmount: string
	destinationBlockchain: Blockchain
	destinationAddress: string
	destinationAmount: string
	createdAt: number
}
