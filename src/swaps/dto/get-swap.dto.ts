import { CreateSwapDto } from "./create-swap.dto"
import { GetPublicWalletDto } from "src/wallets/dto/get-wallet.dto"
import { SwapStatus } from "../swap.entity"

export class GetSwapDto extends CreateSwapDto {
	id: string
	sourceAddress?: string
	sourceTransactionId?: string
	destinationConjugatedAddress?: string
	destinationAmount?: string
	destinationTransactionId?: string
	wallet: GetPublicWalletDto
	status: SwapStatus
	currentConfirmations: number
	totalConfirmations: number
	createdAt: number
	updatedAt: number
	expiresAt: number
}
