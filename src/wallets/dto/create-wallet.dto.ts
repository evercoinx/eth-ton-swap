import { IsOptional, IsUUID, IsEnum, Length, IsBoolean } from "class-validator"
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
	@Length(40, 67)
	address?: string

	@IsOptional()
	@Length(24, 240)
	mnemonic?: string

	@IsOptional()
	@IsBoolean()
	deployed = true
}
