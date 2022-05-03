import { Blockchain } from "src/common/enums/blockchain.enum"

export class GetPublicTokenDto {
	id: string
	blockchain: Blockchain
	name: string
	symbol: string
	decimals: number
	address: string
	conjugatedAddress?: string
	minSwapAmount?: string
	maxSwapAmount?: string
}

export class GetTokenDto extends GetPublicTokenDto {
	createdAt: number
	updatedAt: number
}
