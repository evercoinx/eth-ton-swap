import { IsBoolean, IsNumberString, IsOptional, Length } from "class-validator"

export class TransferDto {
	@Length(48, 67)
	destinationAddress: string

	@IsNumberString()
	amount: string

	@IsOptional()
	@Length(48, 67)
	sourceAddress?: string

	@IsOptional()
	@Length(48, 67)
	ownerAddress?: string

	@IsOptional()
	@Length(48, 67)
	adminAddress?: string

	@IsOptional()
	@IsBoolean()
	bounceable = true

	@IsOptional()
	@IsBoolean()
	dryRun = false
}
