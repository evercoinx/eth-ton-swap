import { IsOptional, IsUUID, IsEnum, Length } from "class-validator"
import { WalletType } from "../wallet.entity"

export class CreateWalletDto {
	@IsUUID(4)
	tokenId: string

	@IsEnum(WalletType)
	type: WalletType

	@IsOptional()
	@Length(64, 128)
	secretKey?: string

	@IsOptional()
	@Length(40, 60)
	address?: string
}
