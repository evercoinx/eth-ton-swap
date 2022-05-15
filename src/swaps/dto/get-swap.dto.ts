import { GetPublicTokenDto } from "src/tokens/dto/get-token.dto"
import { GetPublicWalletDto } from "src/wallets/dto/get-wallet.dto"
import { SwapStatus } from "../enums/swap-status.enum"

export class GetPublicSwapDto {
	id: string
	sourceAddress?: string
	sourceAmount: string
	sourceTokenId: string
	wallet: GetPublicWalletDto
	sourceTransactionId?: string
	destinationAddress: string
	destinationConjugatedAddress?: string
	destinationAmount?: string
	destinationTokenId: string
	destinationTransactionId?: string
	status: SwapStatus
	statusCode?: number
	currentConfirmations: number
	totalConfirmations: number
	orderedAt: number
	createdAt: number
	updatedAt: number
	expiresAt: number
}

export class GetSwapDto {
	id: string
	sourceAddress?: string
	sourceAmount?: string
	sourceToken: GetPublicTokenDto
	sourceWalet: GetPublicWalletDto
	sourceTransactionId?: string
	destinationAddress: string
	destinationConjugatedAddress?: string
	destinationAmount?: string
	destinationToken: GetPublicTokenDto
	destinationWallet?: GetPublicWalletDto
	destinationTransactionId?: string
	status: SwapStatus
	statusCode?: number
	currentConfirmations: number
	totalConfirmations: number
	orderedAt: string
	createdAt: string
	updatedAt: string
	expiresAt: string
}
