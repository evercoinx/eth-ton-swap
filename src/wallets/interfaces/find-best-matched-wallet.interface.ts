import BigNumber from "bignumber.js"
import { Blockchain } from "src/common/enums/blockchain.enum"
import { WalletType } from "../enums/wallet-type.enum"

export interface FindBestMatchedWallet {
	blockchain: Blockchain
	type: WalletType
	minBalance?: BigNumber
	inUse?: boolean
}
