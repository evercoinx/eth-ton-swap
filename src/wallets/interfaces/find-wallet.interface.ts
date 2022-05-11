import { Blockchain } from "src/common/enums/blockchain.enum"

export interface FindWallet {
	blockchain: Blockchain
	address: string
}
