import { IsNumberString, Length } from "class-validator"

export class DeployMinterDto {
	@Length(48, 67)
	adminAddress: string

	@IsNumberString()
	transferAmount: string
}
