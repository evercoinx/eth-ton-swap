import { IsPositive, IsUUID } from "class-validator"

export class TransferTonSwapDto {
	@IsUUID(4)
	swapId: string

	@IsPositive()
	ttl: number
}
