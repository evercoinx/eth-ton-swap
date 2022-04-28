import { IsUUID } from "class-validator"

export class ConfirmTransferDto {
	@IsUUID(4)
	walletId: string
}
