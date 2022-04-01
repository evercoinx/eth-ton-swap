import { IsNumberString, Length } from "class-validator"

export class MintTokensDto {
	@Length(48, 67)
	address: string

	@IsNumberString()
	tokenAmount: string
}
