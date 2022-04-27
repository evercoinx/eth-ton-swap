import { IsNumberString } from "class-validator"

export class UpdateSettingsDto {
	@IsNumberString()
	gasFee?: string

	@IsNumberString()
	minTokenAmount?: string

	@IsNumberString()
	maxTokenAmount?: string
}
