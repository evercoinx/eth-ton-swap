import { GetTokenDto } from "src/tokens/dto/get-token.dto"

export class GetWalletDto {
	id: string
	address: string
	secretKey?: string
	token?: GetTokenDto
	createdAt?: number
}
