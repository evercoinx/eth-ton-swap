import BigNumber from "bignumber.js"
import { Token } from "src/tokens/token.entity"
import { WalletType } from "../enums/wallet-type.enum"

export interface AttachWallet {
	secretKey: string
	mnemonic?: string
	address: string
	conjugatedAddress?: string
	balance: BigNumber
	token: Token
	type: WalletType
}
