import { IsNumberString } from "class-validator"

export class MintMinterDto {
	@IsNumberString()
	tokenAmount: string
}
