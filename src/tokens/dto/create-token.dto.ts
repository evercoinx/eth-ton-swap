import { IsEnum, IsInt, Length } from "class-validator"
import { Blockchain } from "../token.entity"

export class CreateTokenDto {
	@IsEnum(Blockchain)
	blockchain: Blockchain

	@Length(3, 30)
	name: string

	@Length(3, 30)
	symbol: string

	@IsInt()
	decimals: number
}
