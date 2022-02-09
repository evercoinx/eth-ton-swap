import { CreateSwapDto } from "./create-swap.dto"
import { GetWalletDto } from "../../wallets/dto/get-wallet.dto"

export class GetSwapDto extends CreateSwapDto {
	id: string
	wallet: GetWalletDto
	registeredAt: number
}
