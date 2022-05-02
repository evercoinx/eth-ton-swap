import { IsEnum, IsPositive } from "class-validator"
import { Blockchain } from "src/tokens/enums/blockchain.enum"

export class CreateSettingDto {
	@IsEnum(Blockchain)
	blockchain: Blockchain

	@IsPositive()
	currencyDecimals: number
}
