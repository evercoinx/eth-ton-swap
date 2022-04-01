import { Length } from "class-validator"

export class DeployContractDto {
	@Length(48, 67)
	address: string
}
