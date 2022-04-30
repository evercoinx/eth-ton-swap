import { IsPositive, IsUUID } from "class-validator"

export class ConfirmTransferDto {
	@IsUUID(4)
	swapId: string

	@IsPositive()
	blockNumber: number
}
