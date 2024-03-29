import { IsNumberString, Length } from "class-validator"

export class TransferTokensDto {
	@Length(40, 42)
	tokenAddress: string

	@Length(40, 42)
	sourceAddress: string

	@Length(40, 42)
	destinationAddress: string

	@IsNumberString()
	amount: string
}
