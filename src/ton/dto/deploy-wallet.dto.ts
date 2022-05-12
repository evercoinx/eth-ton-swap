import { Transform } from "class-transformer"
import { IsBoolean, IsOptional, Length } from "class-validator"

export class DeployWalletDto {
	@Length(48, 67)
	address: string

	@IsOptional()
	@IsBoolean()
	@Transform(({ value }) => value === "true")
	dryRun = false
}
