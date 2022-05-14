import { Length } from "class-validator"

export class QueryWalletDataDto {
	@Length(48, 67)
	address: string
}
