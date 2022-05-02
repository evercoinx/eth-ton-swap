import { IsBoolean, IsEnum, IsNumberString, IsOptional, Length } from "class-validator"
import { WalletType } from "../enums/wallet-type.enum"

export class UpdateWalletDto {
	@IsOptional()
	@Length(40, 67)
	conjugatedAddress?: string

	@IsOptional()
	@IsNumberString()
	balance?: string

	@IsOptional()
	@IsEnum(WalletType)
	type?: WalletType

	@IsOptional()
	@Length(24, 240)
	mnemonic?: string

	@IsOptional()
	@IsBoolean()
	deployed?: boolean

	@IsOptional()
	@IsBoolean()
	disabled?: boolean

	@IsOptional()
	@IsBoolean()
	inUse?: boolean
}
