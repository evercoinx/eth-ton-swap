import { IsUUID } from "class-validator"

export class SetTransactionIdDto {
	@IsUUID(4)
	swapId: string
}
