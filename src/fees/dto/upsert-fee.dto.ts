import { IsEnum, IsNumberString } from "class-validator"
import { Blockchain } from "src/tokens/token.entity"

export class UpsertFeeDto {
	@IsEnum(Blockchain)
	blockchain: Blockchain

	@IsNumberString()
	maxFeePerGas: string
}
