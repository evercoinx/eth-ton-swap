import { Blockchain } from "../enums/blockchain.enum"

export class GetPublicTokenDto {
	id: string
	blockchain: Blockchain
	name: string
	symbol: string
	decimals: number
	address: string
	conjugatedAddress?: string
}

export class GetTokenDto extends GetPublicTokenDto {
	minSwapAmount: string
	maxSwapAmount: string
	createdAt: number
	updatedAt: number
}
