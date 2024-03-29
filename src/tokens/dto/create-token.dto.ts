import { IsEnum, IsNumberString, IsOptional, IsPositive, IsUUID, Length } from "class-validator"
import { Blockchain } from "src/common/enums/blockchain.enum"

export class CreateTokenDto {
	@IsUUID(4)
	id: string

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
	@Length(48, 67)
	conjugatedAddress?: string

	@IsNumberString()
	minSwapAmount: string

	@IsNumberString()
	maxSwapAmount: string

	@IsOptional()
	@IsPositive()
	coinmarketcapId?: number
}
