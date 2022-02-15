import { IsNumberString, IsPositive, IsUUID, Length } from "class-validator"

export class CreateSwapDto {
	@IsUUID(4)
	sourceTokenId: string

	@IsNumberString()
	sourceAmount: string

	@IsUUID(4)
	destinationTokenId: string

	@Length(40, 60)
	destinationAddress: string

	@IsPositive()
	orderedAt: number
}
