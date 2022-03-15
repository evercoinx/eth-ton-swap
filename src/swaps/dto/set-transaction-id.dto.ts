import { IsPositive, IsUUID } from "class-validator"

export class SetTransactionIdDto {
	@IsUUID(4)
	swapId: string

	@IsPositive()
	ttl: number
}
