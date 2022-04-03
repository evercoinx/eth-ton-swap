import { IsBoolean, IsNumberString, IsOptional, Length } from "class-validator"

export class MintJettonsDto {
	@Length(48, 67)
	address: string

	@IsNumberString()
	jettonAmount: string

	@IsNumberString()
	transferAmount: string

	@IsNumberString()
	mintTransferAmount: string

	@IsOptional()
	@IsBoolean()
	dryRun = false
}
