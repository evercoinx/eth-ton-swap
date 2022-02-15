import { CreateSwapDto } from "./create-swap.dto"
import { GetWalletDto } from "src/wallets/dto/get-wallet.dto"
import { SwapStatus } from "../swap.entity"

export class GetSwapDto extends CreateSwapDto {
	id: string
	sourceAddress?: string
	destinationAmount?: string
	wallet: GetWalletDto
	status: SwapStatus
	createdAt: number
	updatedAt: number
}
