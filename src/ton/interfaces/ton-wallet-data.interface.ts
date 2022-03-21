import { WalletContract } from "tonweb/dist/types/contract/wallet/wallet-contract"

export interface TonWalletData {
	wallet: WalletContract
	secretKey: string
}
