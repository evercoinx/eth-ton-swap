import { Blockchain } from "src/common/enums/blockchain.enum"

export interface CreateToken {
	id: string
	blockchain: Blockchain
	name: string
	symbol: string
	decimals: number
	address: string
	conjugatedAddress?: string
	minSwapAmount: string
	maxSwapAmount: string
	coinmarketcapId?: number
}
