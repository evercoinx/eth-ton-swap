import { IsBoolean, IsNumberString, IsOptional, Length } from "class-validator"

export class BurnJettonsDto {
	@Length(48, 67)
	ownerWalletAddress: string

	@IsNumberString()
	jettonAmount: string

	@IsNumberString()
	transferAmount: string

	@IsOptional()
	@IsBoolean()
	dryRun = false
}
