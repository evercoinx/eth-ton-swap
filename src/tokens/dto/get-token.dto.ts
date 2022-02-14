import { Blockchain } from "../token.entity"

export class GetTokenDto {
	id: string
	name: string
	symbol: string
	decimals: number
	blockchain: Blockchain
}
