import { IsBoolean, IsEnum, IsNumberString, IsOptional, Length } from "class-validator"
import { WalletType } from "../wallet.entity"

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
	@IsBoolean()
	deployed?: boolean

	@IsOptional()
	@IsBoolean()
	inUse?: boolean
}
