import { CreateWalletDto } from "./create-wallet.dto"

export class GetWalletDto extends CreateWalletDto {
	id?: string
	address: string
	secretKey?: string
	createdAt?: number
}
