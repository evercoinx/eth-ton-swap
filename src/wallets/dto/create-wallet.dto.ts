import { IsOptional, IsUUID, Length } from "class-validator"

export class CreateWalletDto {
	@IsUUID(4)
	tokenId: string

	@IsOptional()
	@Length(128)
	secretKey?: string

	@IsOptional()
	@Length(40, 60)
	address?: string
}
