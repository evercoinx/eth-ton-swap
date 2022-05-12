import { Transform } from "class-transformer"
import { IsBoolean, IsOptional, Length } from "class-validator"

export class DeployJettonMinterDto {
	@Length(48, 67)
	adminWalletAddress: string

	@IsOptional()
	@IsBoolean()
	@Transform(({ value }) => value === "true")
	dryRun = false
}
