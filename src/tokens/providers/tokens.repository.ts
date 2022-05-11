import { Injectable } from "@nestjs/common"
import { InjectRepository } from "@nestjs/typeorm"
import BigNumber from "bignumber.js"
import { Repository } from "typeorm"
import { QueryDeepPartialEntity } from "typeorm/query-builder/QueryPartialEntity"
import { CreateTokenDto } from "../dto/create-token.dto"
import { UpdateTokenDto } from "../dto/update-token.dto"
import { FindToken } from "../interfaces/find-token.interface"
import { Token } from "../token.entity"

@Injectable()
export class TokensRepository {
	constructor(@InjectRepository(Token) private readonly repository: Repository<Token>) {}

	async create({
		id,
		blockchain,
		name,
		symbol,
		decimals,
		coinmarketcapId,
	}: CreateTokenDto): Promise<Token> {
		const token = new Token()
		token.id = id
		token.blockchain = blockchain
		token.name = name
		token.symbol = symbol
		token.decimals = decimals
		token.coinmarketcapId = coinmarketcapId

		return await this.repository.save(token)
	}

	async update(
		id: string,
		{
			name,
			symbol,
			decimals,
			conjugatedAddress,
			minSwapAmount,
			maxSwapAmount,
			coinmarketcapId,
			price,
		}: UpdateTokenDto,
	): Promise<void> {
		const partialToken: QueryDeepPartialEntity<Token> = {}
		if (name !== undefined) {
			partialToken.name = name
		}
		if (symbol !== undefined) {
			partialToken.symbol = symbol
		}
		if (decimals !== undefined) {
			partialToken.decimals = decimals
		}
		if (conjugatedAddress !== undefined) {
			partialToken.conjugatedAddress = conjugatedAddress
		}
		if (minSwapAmount !== undefined) {
			partialToken.minSwapAmount = new BigNumber(minSwapAmount).toFixed(decimals)
		}
		if (maxSwapAmount !== undefined) {
			partialToken.maxSwapAmount = new BigNumber(maxSwapAmount).toFixed(decimals)
		}
		if (coinmarketcapId !== undefined) {
			partialToken.coinmarketcapId = coinmarketcapId
		}
		if (price !== undefined) {
			partialToken.price = price.toString()
		}

		await this.repository.update(id, partialToken)
	}

	async findAll(): Promise<Token[]> {
		return this.repository.find({
			order: {
				blockchain: 1,
				name: 1,
			},
		})
	}

	async findById(id: string): Promise<Token | null> {
		return this.repository.findOneBy({ id })
	}

	async findOne({ blockchain, address }: FindToken): Promise<Token | null> {
		return this.repository.findOneBy({
			blockchain,
			address,
		})
	}
}
