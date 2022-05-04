import { IsPositive, IsUUID, Length } from "class-validator"

export class WaitForTransferConfirmationDto {
	@IsUUID(4)
	swapId: string

	@Length(64, 64)
	transactionId: string

	@IsPositive()
	confirmations: number
}
