import BigNumber from "bignumber.js"
import { Quantity } from "src/common/providers/quantity"

export interface UpdateToken {
	name?: string
	symbol?: string
	decimals?: number
	conjugatedAddress?: string
	minSwapAmount?: Quantity
	maxSwapAmount?: Quantity
	coinmarketcapId?: number
	price?: BigNumber
}
