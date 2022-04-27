import { IsEnum, IsPositive } from "class-validator"
import { Blockchain } from "src/tokens/token.entity"

export class CreateSettingDto {
	@IsEnum(Blockchain)
	blockchain: Blockchain

	@IsPositive()
	currencyDecimals: number
}
