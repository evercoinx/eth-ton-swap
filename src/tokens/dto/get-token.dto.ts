import { Blockchain } from "../token.entity"

export class GetTokenDto {
	id: string
	blockchain: Blockchain
	name: string
	symbol: string
	decimals: number
	address?: string
}
