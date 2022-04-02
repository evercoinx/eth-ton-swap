import { IsBoolean, IsNumberString, IsOptional, Length } from "class-validator"

export class TransferToncoinsDto {
	@Length(48, 67)
	sourceAddress: string

	@Length(48, 67)
	destinationAddress: string

	@IsNumberString()
	amount: string

	@IsBoolean()
	bounceable: boolean

	@IsOptional()
	@IsBoolean()
	dryRun = true
}
