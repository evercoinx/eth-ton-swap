import { Blockchain } from "src/common/enums/blockchain.enum"
import { Quantity } from "src/common/providers/quantity"

export interface CreateToken {
	id: string
	blockchain: Blockchain
	name: string
	symbol: string
	decimals: number
	address: string
	conjugatedAddress?: string
	minSwapAmount: Quantity
	maxSwapAmount: Quantity
	coinmarketcapId?: number
}
