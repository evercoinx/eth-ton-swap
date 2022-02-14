import { IsEnum, IsInt, Length } from "class-validator"
import { Blockchain } from "../token.entity"

export class CreateTokenDto {
	@Length(3, 30)
	name: string

	@Length(3, 30)
	symbol: string

	@IsInt()
	decimals: number

	@IsEnum(Blockchain)
	blockchain: Blockchain

	@IsInt()
	coinmarketcapId: number
}
