import { IsUUID } from "class-validator"

export class TransferSwapDto {
	@IsUUID(4)
	swapId: string
}
