import { IsEnum, IsNumberString, IsOptional, IsPositive, IsUUID, Length } from "class-validator"
import { SwapStatus } from "../swap.entity"

export class UpdateSwapDto {
	@IsUUID(4)
	id: string

	@IsOptional()
	@Length(40, 67)
	sourceAddress?: string

	@IsOptional()
	@IsNumberString()
	sourceAmount?: string

	@IsOptional()
	@Length(85)
	sourceTransactionId?: string

	@IsOptional()
	@IsNumberString()
	destinationAmount?: string

	@IsOptional()
	@Length(85)
	destinationTransactionId?: string

	@IsOptional()
	@IsNumberString()
	fee?: string

	@IsOptional()
	@Length(85)
	collectorTransactionId?: string

	@IsOptional()
	@IsEnum(SwapStatus)
	status?: SwapStatus

	@IsOptional()
	@IsPositive()
	confirmations?: number
}
