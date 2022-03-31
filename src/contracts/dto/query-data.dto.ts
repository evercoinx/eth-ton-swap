import { Length } from "class-validator"

export class QueryDataDto {
	@Length(48, 67)
	address: string
}
