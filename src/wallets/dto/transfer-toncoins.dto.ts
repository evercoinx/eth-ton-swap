import { IsUUID } from "class-validator"

export class TransferToncoinsDto {
	@IsUUID(4)
	walletId: string

	@IsUUID(4)
	giverWalletId: string
}
