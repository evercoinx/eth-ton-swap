import { IsPositive, IsUUID } from "class-validator"

export class TransferFeeDto {
	@IsUUID(4)
	swapId: string

	@IsPositive()
	ttl: number
}
