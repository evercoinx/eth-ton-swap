import { Length } from "class-validator"

export class GetDataDto {
	@Length(48, 67)
	address: string
}
