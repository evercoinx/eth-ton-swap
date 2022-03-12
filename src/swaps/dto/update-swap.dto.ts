import { IsEnum, IsNumberString, IsOptional, IsPositive, IsUUID, Length } from "class-validator"
import { SwapStatus } from "../swap.entity"

export class UpdateSwapDto {
	@IsUUID(4)
	id: string

	@IsOptional()
	@Length(40, 60)
	sourceAddress?: string

	@IsOptional()
	@IsNumberString()
	sourceAmount?: string

	@IsOptional()
	@Length(64)
	sourceTransactionHash?: string

	@IsOptional()
	@IsNumberString()
	destinationAmount?: string

	@IsOptional()
	@Length(64)
	destinationTransactionHash?: string

	@IsOptional()
	@IsNumberString()
	fee?: string

	@IsOptional()
	@Length(64)
	collectorTransactionHash?: string

	@IsOptional()
	@IsEnum(SwapStatus)
	status?: SwapStatus

	@IsOptional()
	@IsPositive()
	blockConfirmations?: number
}
