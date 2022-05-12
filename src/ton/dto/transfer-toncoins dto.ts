import { Transform } from "class-transformer"
import { IsBoolean, IsNumberString, IsOptional, Length } from "class-validator"

export class TransferToncoinsDto {
	@Length(48, 67)
	sourceAddress: string

	@Length(48, 67)
	destinationAddress: string

	@IsNumberString()
	amount: string

	@IsOptional()
	@Length(0, 256)
	payload?: string

	@IsOptional()
	@IsBoolean()
	@Transform(({ value }) => value === "true")
	bounceable = true

	@IsOptional()
	@IsBoolean()
	@Transform(({ value }) => value === "true")
	dryRun = false
}
