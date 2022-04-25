import { JettonOperation } from "../ton-blockchain.provider"

export interface JettonOutgoingTransaction {
	operation: JettonOperation.TRANSFER
	time: number
	queryId: string
	amount: string
	destination?: string
	comment: string
}
