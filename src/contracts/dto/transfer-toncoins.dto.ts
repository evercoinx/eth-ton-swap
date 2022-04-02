import { IsBoolean, IsNumberString, Length } from "class-validator"

export class TransferToncoinsDto {
	@Length(48, 67)
	sourceAddress: string

	@Length(48, 67)
	destinationAddress: string

	@IsNumberString()
	amount: string

	@IsBoolean()
	dryRun: boolean
}
