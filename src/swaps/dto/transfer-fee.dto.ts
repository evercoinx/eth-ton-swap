import { IsUUID } from "class-validator"

export class TransferFeeDto {
	@IsUUID(4)
	swapId: string
}
