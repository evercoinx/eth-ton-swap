import { IsBoolean, IsOptional, Length } from "class-validator"

export class DeployJettonMinterDto {
	@Length(48, 67)
	adminWalletAddress: string

	@IsOptional()
	@IsBoolean()
	dryRun = false
}
