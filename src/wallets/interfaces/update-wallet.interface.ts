import { Quantity } from "src/common/providers/quantity"
import { WalletType } from "../enums/wallet-type.enum"

export interface UpdateWallet {
	mnemonic?: string
	conjugatedAddress?: string
	balance?: Quantity
	type?: WalletType
	deployed?: boolean
	inUse?: boolean
	disabled?: boolean
}
