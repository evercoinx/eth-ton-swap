import { IsBoolean, IsNumberString, Length } from "class-validator"

export class MintJettonsDto {
	@Length(48, 67)
	address: string

	@IsNumberString()
	jettonAmount: string

	@IsBoolean()
	dryRun: boolean
}
