import { IsNumberString, Length } from "class-validator"

export class TransferDto {
	@Length(40, 40)
	sourceAddress: string

	@Length(40, 40)
	destinationAddress: string

	@IsNumberString()
	amount: string
}
