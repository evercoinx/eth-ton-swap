import { WalletType } from "../enums/wallet-type.enum"

export interface UpdateWallet {
	mnemonic?: string
	conjugatedAddress?: string
	balance?: string
	type?: WalletType
	deployed?: boolean
	inUse?: boolean
	disabled?: boolean
}
