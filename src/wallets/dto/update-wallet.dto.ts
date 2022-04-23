import { IsBoolean, IsNumberString, IsOptional, Length } from "class-validator"

export class UpdateWalletDto {
	@IsOptional()
	@Length(40, 67)
	conjugatedAddress?: string

	@IsOptional()
	@IsNumberString()
	balance?: string

	@IsOptional()
	@IsBoolean()
	deployed?: boolean

	@IsOptional()
	@IsBoolean()
	inUse?: boolean
}
