import { Blockchain } from "src/common/enums/blockchain.enum"

export interface FindToken {
	blockchain: Blockchain
	address: string
}
