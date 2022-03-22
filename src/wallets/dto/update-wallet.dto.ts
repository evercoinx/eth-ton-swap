import { IsNumberString, IsUUID } from "class-validator"

export class UpdateWalletDto {
	@IsUUID(4)
	id: string

	@IsNumberString()
	balance: string
}
