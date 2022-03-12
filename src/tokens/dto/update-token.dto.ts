import { IsPositive, IsUUID } from "class-validator"

export class UpdateTokenDto {
	@IsUUID(4)
	id: string

	@IsPositive()
	price: number
}
