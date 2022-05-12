import BigNumber from "bignumber.js"
import { Blockchain } from "src/common/enums/blockchain.enum"

export interface CreateSetting {
	blockchain: Blockchain
	decimals: number
	minWalletBalance: BigNumber
}
