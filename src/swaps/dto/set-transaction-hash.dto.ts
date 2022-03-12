import { IsPositive, IsUUID } from "class-validator"

export class SetTransactionHashDto {
	@IsUUID(4)
	swapId: string

	@IsPositive()
	ttl: number
}
