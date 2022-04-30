import { IsUUID } from "class-validator"

export class TransferTokensDto {
	@IsUUID(4)
	swapId: string
}
