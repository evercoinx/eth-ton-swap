import { IsUUID, IsEnum, Length, IsOptional } from "class-validator"
import { WalletType } from "../wallet.entity"

export class AttachWalletDto {
	@IsUUID(4)
	tokenId: string

	@IsEnum(WalletType)
	type: WalletType

	@Length(64, 128)
	secretKey: string

	@Length(40, 67)
	address: string

	@IsOptional()
	@Length(40, 67)
	conjugatedAddress?: string

	@IsOptional()
	@Length(24, 240)
	mnemonic?: string
}
