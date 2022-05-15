import { Transform } from "class-transformer"
import { IsBoolean, IsEnum, IsNumberString, IsOptional } from "class-validator"
import { Blockchain } from "src/common/enums/blockchain.enum"
import { WalletType } from "../enums/wallet-type.enum"

export class QueryWalletsDto {
	@IsOptional()
	@IsEnum(Blockchain)
	blockchain?: Blockchain

	@IsOptional()
	@IsEnum(WalletType)
	type?: WalletType

	@IsOptional()
	@IsNumberString()
	minBalance?: string

	@IsOptional()
	@IsBoolean()
	@Transform(({ value }) => value === "true")
	deployed?: boolean

	@IsOptional()
	@IsBoolean()
	@Transform(({ value }) => value === "true")
	inUse?: boolean

	@IsOptional()
	@IsBoolean()
	@Transform(({ value }) => value === "true")
	disabled?: boolean
}
