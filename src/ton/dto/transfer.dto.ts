import { IsBoolean, IsNumberString, IsOptional, Length } from "class-validator"

export class TransferDto {
	@Length(48, 67)
	sourceAddress: string

	@Length(48, 67)
	destinationAddress: string

	@IsNumberString()
	amount: string

	@IsOptional()
	@Length(48, 67)
	minterAdminAddress: string

	@IsOptional()
	@Length(0, 256)
	payload?: string

	@IsOptional()
	@IsBoolean()
	bounceable = true

	@IsOptional()
	@IsBoolean()
	dryRun = false
}
