import { IsNumberString } from "class-validator"

export class DeployMinterDto {
	@IsNumberString()
	transferAmount: string
}
