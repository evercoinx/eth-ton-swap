import { BigNumber } from "bignumber.js"

export interface SwapAmounts {
	grossSourceAmount: BigNumber
	netSourceAmount: BigNumber
	destinationAmount: BigNumber
	fee: BigNumber
}
