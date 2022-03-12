import { IsPositive, IsUUID } from "class-validator"

export class ConfirmBlockDto {
	@IsUUID(4)
	swapId: string

	@IsPositive()
	ttl: number

	@IsPositive()
	blockNumber: number

	@IsPositive()
	blockConfirmations: number
}
