import BigNumber from "bignumber.js"
import { AccountState } from "ton-node"
import { Address } from "tonweb/dist/types/utils/address"

export interface WalletData {
	isWallet: boolean
	address: Address
	balance: BigNumber
	accountState: AccountState
	walletType?: string
	seqno?: number
}
