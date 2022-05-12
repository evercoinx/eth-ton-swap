import { IsUUID } from "class-validator"

export class ConfirmWalletDeployDto {
	@IsUUID(4)
	walletId: string
}
