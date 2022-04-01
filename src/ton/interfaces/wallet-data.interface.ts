import BigNumber from "bignumber.js"
import { AccountState } from "ton-node"
import { AddressType } from "tonweb/dist/types/utils/address"

export interface WalletData {
	address: AddressType
	balance: BigNumber
	accountState: AccountState
	walletType?: string
	seqno?: number
}
