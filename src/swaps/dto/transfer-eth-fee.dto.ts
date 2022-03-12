import { IsPositive, IsUUID } from "class-validator"

export class TransferEthFeeDto {
	@IsUUID(4)
	swapId: string

	@IsPositive()
	ttl: number
}
