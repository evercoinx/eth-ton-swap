import { IsEnum, IsNotEmpty, IsNumberString, IsPositive } from "class-validator"
import { Blockchain, Token } from "../swap.entity"

export class CreateSwapDto {
	@IsEnum(Blockchain)
	sourceBlockchain: Blockchain

	@IsEnum(Token)
	sourceToken: Token

	@IsNotEmpty()
	sourceAddress: string

	@IsNumberString()
	sourceAmount: string

	@IsEnum(Blockchain)
	destinationBlockchain: Blockchain

	@IsEnum(Token)
	destinationToken: Token

	@IsNotEmpty()
	destinationAddress: string

	@IsNumberString()
	destinationAmount: string

	@IsPositive()
	orderedAt: number
}
