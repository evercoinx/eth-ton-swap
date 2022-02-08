import { IsEnum, IsNotEmpty, IsNumberString, IsPositive } from "class-validator"
import { Blockchain } from "../swap.entity"

export class CreateSwapDto {
	@IsEnum(Blockchain)
	sourceBlockchain: Blockchain

	@IsNotEmpty()
	sourceAddress: string

	@IsNumberString()
	sourceAmount: string

	@IsEnum(Blockchain)
	destinationBlockchain: Blockchain

	@IsNotEmpty()
	destinationAddress: string

	@IsNumberString()
	destinationAmount: string

	@IsPositive()
	createdAt: number
}
