import { IsUUID, IsEnum, IsOptional } from "class-validator"
import { WalletType } from "../enums/wallet-type.enum"

export class CreateWalletDto {
	@IsUUID(4)
	tokenId: string

	@IsEnum(WalletType)
	type: WalletType

	@IsOptional()
	@IsUUID(4)
	giverWalletId?: string
}
