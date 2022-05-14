import { Length } from "class-validator"

export class QueryJettonMinterDataDto {
	@Length(48, 67)
	address: string
}
