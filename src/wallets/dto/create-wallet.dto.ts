import { IsUUID } from "class-validator"

export class CreateWalletDto {
	@IsUUID(4)
	tokenId: string
}
