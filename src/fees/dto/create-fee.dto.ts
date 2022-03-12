import { IsEnum, IsNumberString } from "class-validator"
import { Blockchain } from "../fee.entity"

export class CreateFeeDto {
	@IsEnum(Blockchain)
	blockchain: Blockchain

	@IsNumberString()
	maxFeePerGas: string
}
