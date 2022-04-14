import { Length } from "class-validator"

export class QueryContractDataDto {
	@Length(40, 40)
	address: string
}
