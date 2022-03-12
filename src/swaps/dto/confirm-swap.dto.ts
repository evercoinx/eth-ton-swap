import { IsPositive, IsUUID } from "class-validator"

export class ConfirmSwapDto {
	@IsUUID(4)
	swapId: string

	@IsPositive()
	ttl: number

	@IsPositive()
	blockNumber: number
}
