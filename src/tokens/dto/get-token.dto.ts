import { Blockchain } from "../token.entity"

export class GetTokenDto {
	id: string
	blockchain: Blockchain
	address: string
	name: string
	symbol: string
	decimals: number
}
