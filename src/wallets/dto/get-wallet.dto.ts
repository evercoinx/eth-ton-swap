import { GetPublicTokenDto } from "src/tokens/dto/get-token.dto"
import { WalletType } from "../enums/wallet-type.enum"

export class GetPublicWalletDto {
	id: string
	address: string
	conjugatedAddress: string
}

export class GetWalletDto extends GetPublicWalletDto {
	id: string
	mnemonic: string[]
	balance: string
	token: GetPublicTokenDto
	type: WalletType
	deployed: boolean
	isUse: boolean
	disabled: boolean
	createdAt: number
	updatedAt: number
}
