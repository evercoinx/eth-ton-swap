import { IsEnum, IsOptional, IsPositive, Length } from "class-validator"
import { Blockchain } from "../token.entity"

export class CreateTokenDto {
	@IsEnum(Blockchain)
	blockchain: Blockchain

	@Length(3, 30)
	name: string

	@Length(3, 30)
	symbol: string

	@IsPositive()
	decimals: number

	@Length(40, 67)
	address: string

	@IsOptional()
	@IsPositive()
	coinmarketcapId?: number
}
