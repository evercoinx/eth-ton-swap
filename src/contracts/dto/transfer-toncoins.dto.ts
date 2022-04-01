import { IsBoolean, IsNumberString, Length } from "class-validator"

export class TransferToncoinsDto {
	@Length(48, 67)
	fromAddress: string

	@Length(48, 67)
	toAddress: string

	@IsNumberString()
	amount: string

	@IsBoolean()
	dryRun: boolean
}
