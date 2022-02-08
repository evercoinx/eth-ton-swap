import { Blockchain } from "../swap.entity"

export class GetSwapDto {
	id: string
	sourceBlockchain: Blockchain
	sourceAddress: string
	sourceAmount: string
	destinationBlockchain: Blockchain
	destinationAddress: string
	destinationAmount: string
	registeredAt: number
	createdAt: number
}
