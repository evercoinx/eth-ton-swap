import { WalletContract } from "tonweb/dist/types/contract/wallet/wallet-contract"

export interface TonWalletSigner {
	wallet: WalletContract
	secretKey: string
}
