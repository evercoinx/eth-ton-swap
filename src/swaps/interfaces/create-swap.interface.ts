import BigNumber from "bignumber.js"
import { Token } from "src/tokens/token.entity"
import { Wallet } from "src/wallets/wallet.entity"

export interface CreateSwap {
	sourceAmount: BigNumber
	sourceToken: Token
	sourceWallet: Wallet
	destinationAddress: string
	destinationAmount: BigNumber
	destinationToken: Token
	destinationWallet?: Wallet
	fee: BigNumber
	ipAddress: string
	collectorWallet: Wallet
	orderedAt: Date
}
