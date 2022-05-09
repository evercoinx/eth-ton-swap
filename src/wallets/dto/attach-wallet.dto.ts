import { IsUUID, IsEnum, Length, IsOptional } from "class-validator"
import { WalletType } from "../enums/wallet-type.enum"

export class AttachWalletDto {
	@IsUUID(4)
	tokenId: string

	@Length(64, 128)
	secretKey: string

	@IsOptional()
	@Length(24, 240)
	mnemonic?: string

	@Length(40, 67)
	address: string

	@IsOptional()
	@Length(40, 67)
	conjugatedAddress?: string

	@IsEnum(WalletType)
	type: WalletType
}
