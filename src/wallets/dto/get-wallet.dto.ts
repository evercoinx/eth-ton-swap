import { GetTokenDto } from "src/tokens/dto/get-token.dto"
import { WalletType } from "../wallet.entity"

export class GetWalletDto {
	id: string
	secretKey?: string
	address: string
	conjugatedAddress: string
	balance?: string
	token?: GetTokenDto
	type: WalletType
	deployed?: boolean
	isUse?: boolean
	createdAt?: number
}
