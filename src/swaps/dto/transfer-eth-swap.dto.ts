import { IsPositive, IsUUID } from "class-validator"

export class TransferEthSwapDto {
	@IsUUID(4)
	swapId: string

	@IsPositive()
	ttl: number
}
