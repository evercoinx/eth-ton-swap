import { WalletContract } from "tonweb/dist/types/contract/wallet/wallet-contract"

export interface WalletSigner {
	wallet: WalletContract
	secretKey: string
}
