import { IsBoolean, IsNumberString, IsOptional, Length } from "class-validator"

export class DeployContractDto {
	@Length(48, 67)
	address: string

	@IsOptional()
	@IsNumberString()
	transferAmount = "0"

	@IsOptional()
	@IsBoolean()
	dryRun = false

	@IsOptional()
	@IsBoolean()
	redeploy = false
}
