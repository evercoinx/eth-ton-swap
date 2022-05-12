import { Quantity } from "src/common/providers/quantity"
import { Token } from "src/tokens/token.entity"
import { Wallet } from "src/wallets/wallet.entity"

export interface CreateSwap {
	sourceAmount: Quantity
	sourceToken: Token
	sourceWallet: Wallet
	destinationAddress: string
	destinationAmount: Quantity
	destinationToken: Token
	destinationWallet?: Wallet
	fee: Quantity
	ipAddress: string
	collectorWallet: Wallet
	orderedAt: Date
}
