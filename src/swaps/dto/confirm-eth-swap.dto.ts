import { IsPositive, IsUUID } from "class-validator"

export class ConfirmEthSwapDto {
	@IsUUID(4)
	swapId: string

	@IsPositive()
	ttl: number

	@IsPositive()
	blockNumber: number
}
