import { IsEnum, IsOptional } from "class-validator"
import { Blockchain, Token } from "../wallet.entity"

export class ListWalletsDto {
	@IsOptional()
	@IsEnum(Blockchain)
	blockchain?: Blockchain

	@IsOptional()
	@IsEnum(Token)
	token?: Token
}
