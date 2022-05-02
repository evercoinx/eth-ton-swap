import { GetPublicTokenDto } from "src/tokens/dto/get-token.dto"
import { WalletType } from "../enums/wallet-type.enum"

export class GetPublicWalletDto {
	id: string
	address: string
	conjugatedAddress: string
}

export class GetWalletDto extends GetPublicWalletDto {
	id: string
	secretKey: string
	balance: string
	token: GetPublicTokenDto
	type: WalletType
	mnemonic: string[]
	deployed: boolean
	isUse: boolean
	disabled: boolean
	createdAt: number
	updatedAt: number
}
