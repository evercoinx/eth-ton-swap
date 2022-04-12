import BigNumber from "bignumber.js"

export interface TransferLog {
	sourceAddress: string
	destinationAddress: string
	transferAmount: BigNumber
}