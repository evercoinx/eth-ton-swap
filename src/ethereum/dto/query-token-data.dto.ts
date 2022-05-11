import { Transform } from "class-transformer"
import { IsArray, Length } from "class-validator"

export class QueryTokenDataDto {
	@IsArray()
	@Transform(({ value }) => (typeof value === "string" ? value.split(",") : value))
	tokenAddresses: string[]

	@Length(40, 42)
	walletAddress: string
}
