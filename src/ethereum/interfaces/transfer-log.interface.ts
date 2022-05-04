import BigNumber from "bignumber.js"

export interface TransferLog {
	transactionId: string
	sourceAddress: string
	destinationAddress: string
	amount: BigNumber
}
