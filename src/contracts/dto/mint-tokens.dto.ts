import { IsNumberString, Length } from "class-validator"

export class MintTokensDto {
	@Length(48, 67)
	adminAddress: string

	@IsNumberString()
	tokenAmount: string
}
