import BigNumber from "bignumber.js"

export interface UpdateToken {
	name?: string
	symbol?: string
	decimals?: number
	conjugatedAddress?: string
	minSwapAmount?: BigNumber
	maxSwapAmount?: BigNumber
	coinmarketcapId?: number
	price?: BigNumber
}
