import { IsBoolean, IsNumberString, IsUUID, Length } from "class-validator"

export class UpdateWalletDto {
	@IsUUID(4)
	id: string

	@Length(40, 48)
	relatedAddress?: string

	@IsNumberString()
	balance?: string

	@IsBoolean()
	deployed?: boolean
}
