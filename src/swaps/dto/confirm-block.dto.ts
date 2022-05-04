import { IsPositive, IsUUID, Length } from "class-validator"

export class ConfirmBlockDto {
	@IsUUID(4)
	swapId: string

	@Length(64, 64)
	transactionId: string

	@IsPositive()
	blockNumber: number

	@IsPositive()
	confirmations: number
}
