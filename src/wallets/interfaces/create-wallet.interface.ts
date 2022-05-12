import { Token } from "src/tokens/token.entity"
import { WalletType } from "../enums/wallet-type.enum"

export interface CreateWallet {
	type: WalletType
	token: Token
}
