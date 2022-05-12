import { Transform } from "class-transformer"
import { IsBoolean, IsNumberString, IsOptional, Length } from "class-validator"

export class MintJettonsDto {
	@Length(48, 67)
	adminAddress: string

	@Length(48, 67)
	destinationAddress: string

	@IsNumberString()
	jettonAmount: string

	@IsNumberString()
	transferAmount: string

	@IsNumberString()
	mintTransferAmount: string

	@IsOptional()
	@IsBoolean()
	@Transform(({ value }) => value === "true")
	dryRun = false
}
