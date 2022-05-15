import BigNumber from "bignumber.js"
import { Blockchain } from "src/common/enums/blockchain.enum"
import { WalletType } from "../enums/wallet-type.enum"

export interface FindAllWallets {
	blockchain?: Blockchain
	type?: WalletType
	minBalance?: BigNumber
	deployed?: boolean
	inUse?: boolean
	disabled?: boolean
	hasConjugatedAddress?: boolean
}
