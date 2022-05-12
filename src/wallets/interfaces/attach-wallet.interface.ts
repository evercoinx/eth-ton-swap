import { Quantity } from "src/common/providers/quantity"
import { Token } from "src/tokens/token.entity"
import { WalletType } from "../enums/wallet-type.enum"

export interface AttachWallet {
	secretKey: string
	mnemonic?: string
	address: string
	conjugatedAddress?: string
	balance: Quantity
	token: Token
	type: WalletType
}
