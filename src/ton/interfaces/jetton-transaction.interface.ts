export interface JettonTransaction {
	sourceAddress?: string
	destinationAddress?: string
	amount: string
	time: number
	queryId: string
	payload: string
}
