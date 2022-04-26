import { Wallet } from "nestjs-ethers"

export interface WalletSigner {
	wallet: Wallet
	secretKey: string
	mnemonic?: string[]
}
