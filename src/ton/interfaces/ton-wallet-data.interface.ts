import { contract } from "tonweb"

export interface TonWalletData {
	wallet: contract.WalletContract
	secretKey: string
}
