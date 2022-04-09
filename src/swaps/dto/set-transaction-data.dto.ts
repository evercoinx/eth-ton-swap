import { IsUUID } from "class-validator"

export class SetTransactionDataDto {
	@IsUUID(4)
	swapId: string
}
