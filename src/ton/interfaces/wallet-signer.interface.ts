import { WalletContract } from "tonweb/dist/types/contract/wallet/wallet-contract"

export interface VoidWalletSigner {
	wallet: WalletContract
}

export interface WalletSigner extends VoidWalletSigner {
	secretKey: string
}
