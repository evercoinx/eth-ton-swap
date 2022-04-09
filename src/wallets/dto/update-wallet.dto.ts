import { IsBoolean, IsNumberString, IsOptional, IsUUID, Length } from "class-validator"

export class UpdateWalletDto {
	@IsUUID(4)
	id: string

	@IsOptional()
	@Length(40, 67)
	conjugatedAddress?: string

	@IsOptional()
	@IsNumberString()
	balance?: string

	@IsOptional()
	@IsBoolean()
	deployed?: boolean
}
