import { IsPositive, IsUUID } from "class-validator"

export class SetTonTransactionHashDto {
	@IsUUID(4)
	swapId: string

	@IsPositive()
	ttl: number
}
