import { IsUUID } from "class-validator"

export class DeployWalletDto {
	@IsUUID(4)
	walletId: string
}
