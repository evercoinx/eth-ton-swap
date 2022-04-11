import { Wallet } from "nestjs-ethers"

export interface VoidWalletSigner {
	wallet: Wallet
}

export interface WalletSigner extends VoidWalletSigner {
	secretKey: string
}
