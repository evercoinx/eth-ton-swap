import { Transform } from "class-transformer"
import { IsArray, Length } from "class-validator"

export class QueryTokenWalletDataDto {
	@IsArray()
	@Transform(({ value }) => (typeof value === "string" ? value.split(",") : value))
	tokenAddresses: string[]

	@Length(40, 40)
	walletAddress: string
}