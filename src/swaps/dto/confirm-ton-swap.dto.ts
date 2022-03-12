import { IsPositive, IsUUID } from "class-validator"

export class ConfirmTonSwapDto {
	@IsUUID(4)
	swapId: string

	@IsPositive()
	ttl: number
}
