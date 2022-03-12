import { IsPositive, IsUUID } from "class-validator"

export class TransferSwapDto {
	@IsUUID(4)
	swapId: string

	@IsPositive()
	ttl: number
}
