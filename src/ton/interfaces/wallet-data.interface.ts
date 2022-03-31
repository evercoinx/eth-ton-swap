import BigNumber from "bignumber.js"
import { AccountState } from "ton-node"

export interface WalletData {
	walletType: string
	balance: BigNumber
	accountState: AccountState
	seqno: number
}
