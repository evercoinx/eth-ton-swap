import BigNumber from "bignumber.js"

export interface FeeData {
	maxFeePerGas?: BigNumber
	maxPriorityFeePerGas?: BigNumber
	gasPrice?: BigNumber
}
