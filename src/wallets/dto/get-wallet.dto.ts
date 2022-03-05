import { GetTokenDto } from "src/tokens/dto/get-token.dto"
import { WalletType } from "../wallet.entity"

export class GetWalletDto {
	id: string
	address: string
	secretKey?: string
	type: WalletType
	token?: GetTokenDto
	createdAt?: number
}
