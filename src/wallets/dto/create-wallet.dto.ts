import { IsEnum } from "class-validator"
import { Blockchain, Token } from "../wallet.entity"

export class CreateWalletDto {
	@IsEnum(Blockchain)
	blockchain: Blockchain

	@IsEnum(Token)
	token: Token
}
