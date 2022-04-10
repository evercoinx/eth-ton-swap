import { IsPositive } from "class-validator"

export class UpdateTokenDto {
	@IsPositive()
	price: number
}
