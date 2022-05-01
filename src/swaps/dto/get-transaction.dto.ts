import { IsUUID } from "class-validator"

export class GetTransactionDto {
	@IsUUID(4)
	swapId: string
}
