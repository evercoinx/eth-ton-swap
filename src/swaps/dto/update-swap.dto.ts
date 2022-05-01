import { IsEnum, IsNumberString, IsOptional, IsPositive, Length } from "class-validator"
import { SwapStatus } from "../enums/swap-status.enum"

export class UpdateSwapDto {
	@IsOptional()
	@Length(40, 48)
	sourceAddress?: string

	@IsOptional()
	@IsNumberString()
	sourceAmount?: string

	@IsOptional()
	@Length(48, 48)
	sourceConjugatedAddress?: string

	@IsOptional()
	@Length(64)
	sourceTransactionId?: string

	@IsOptional()
	@Length(48, 48)
	destinationConjugatedAddress?: string

	@IsOptional()
	@IsNumberString()
	destinationAmount?: string

	@IsOptional()
	@Length(64)
	destinationTransactionId?: string

	@IsOptional()
	@IsNumberString()
	fee?: string

	@IsOptional()
	@Length(64)
	collectorTransactionId?: string

	@IsOptional()
	@Length(64)
	burnTransactionId?: string

	@IsOptional()
	@IsEnum(SwapStatus)
	status?: SwapStatus

	@IsOptional()
	@IsPositive()
	confirmations?: number
}
