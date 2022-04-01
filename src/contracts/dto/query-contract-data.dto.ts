import { Length } from "class-validator"

export class QueryContractDataDto {
	@Length(48, 67)
	address: string
}
