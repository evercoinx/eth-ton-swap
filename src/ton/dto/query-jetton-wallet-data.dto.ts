import { Transform } from "class-transformer"
import { IsArray, Length } from "class-validator"

export class QueryJettonWalletDataDto {
	@IsArray()
	@Transform(({ value }) => value.split(","))
	minterAdminAddresses: string[]

	@Length(48, 67)
	walletAddress: string
}
