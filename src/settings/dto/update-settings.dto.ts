import { IsNumberString } from "class-validator"

export class UpdateSettingDto {
	@IsNumberString()
	gasFee?: string
}
