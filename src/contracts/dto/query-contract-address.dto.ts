import { Length } from "class-validator"

export class QueryContractAddressDto {
	@Length(48, 67)
	adminWalletAddress: string

	@Length(48, 67)
	ownerWalletAddress: string
}
