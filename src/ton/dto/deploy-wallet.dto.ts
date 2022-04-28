import { IsBoolean, IsOptional, Length } from "class-validator"

export class DeployWalletDto {
	@Length(48, 67)
	address: string

	@IsOptional()
	@IsBoolean()
	dryRun = false
}
