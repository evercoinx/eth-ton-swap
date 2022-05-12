import { Transform } from "class-transformer"
import { IsArray, Length } from "class-validator"

export class QueryTokenDataDto {
	@IsArray()
	@Transform(({ value }) => value.split(","))
	tokenAddresses: string[]

	@Length(40, 42)
	walletAddress: string
}
