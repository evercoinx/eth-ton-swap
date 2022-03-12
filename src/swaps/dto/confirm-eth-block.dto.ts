import { IsPositive, IsUUID } from "class-validator"

export class ConfirmEthBlockDto {
	@IsUUID(4)
	swapId: string

	@IsPositive()
	ttl: number

	@IsPositive()
	blockNumber: number

	@IsPositive()
	blockConfirmations: number
}
