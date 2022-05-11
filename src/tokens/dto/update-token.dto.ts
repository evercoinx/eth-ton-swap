import { IsNumberString, IsOptional, IsPositive, Length } from "class-validator"

export class UpdateTokenDto {
	@IsOptional()
	@Length(3, 30)
	name?: string

	@IsOptional()
	@Length(3, 30)
	symbol?: string

	@IsOptional()
	@IsPositive()
	decimals?: number

	@IsOptional()
	@Length(48, 67)
	conjugatedAddress?: string

	@IsOptional()
	@IsNumberString()
	minSwapAmount?: string

	@IsOptional()
	@IsNumberString()
	maxSwapAmount?: string

	@IsOptional()
	@IsPositive()
	coinmarketcapId?: number

	@IsOptional()
	@IsPositive()
	price?: number
}
