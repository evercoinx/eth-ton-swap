import { Transform } from "class-transformer"
import { IsArray } from "class-validator"
import { Blockchain } from "src/common/enums/blockchain.enum"

export class DepositWalletsBalanceDto {
	@IsArray()
	@Transform(({ value }) => (typeof value === "string" ? value.split(",") : value))
	blockchains: Blockchain[]
}
