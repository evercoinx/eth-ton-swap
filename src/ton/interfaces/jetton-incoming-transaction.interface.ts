import { JettonOperation } from "../ton-blockchain.provider"

export interface JettonIncomingTransaction {
	operation: JettonOperation.INTERNAL_TRANSFER
	time: number
	queryId: string
	amount: string
	source?: string
	comment: string
}
