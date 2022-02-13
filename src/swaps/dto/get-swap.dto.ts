import { CreateSwapDto } from "./create-swap.dto"
import { GetWalletDto } from "src/wallets/dto/get-wallet.dto"

export class GetSwapDto extends CreateSwapDto {
	id: string
	sourceAddress?: string
	destinationAmount?: string
	wallet: GetWalletDto
	createdAt: number
}
