import { IsUUID, IsEnum } from "class-validator"
import { WalletType } from "../wallet.entity"

export class CreateWalletDto {
	@IsUUID(4)
	tokenId: string

	@IsEnum(WalletType)
	type: WalletType
}
