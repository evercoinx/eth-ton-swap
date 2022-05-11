import { Injectable } from "@nestjs/common"
import { InjectRepository } from "@nestjs/typeorm"
import BigNumber from "bignumber.js"
import { Repository } from "typeorm"
import { QueryDeepPartialEntity } from "typeorm/query-builder/QueryPartialEntity"
import { Blockchain } from "src/common/enums/blockchain.enum"
import { CreateTokenDto } from "../dto/create-token.dto"
import { UpdateTokenDto } from "../dto/update-token.dto"
import { Token } from "../token.entity"

@Injectable()
export class TokensRepository {
	constructor(@InjectRepository(Token) private readonly repository: Repository<Token>) {}

	async create(createTokenDto: CreateTokenDto): Promise<Token> {
		const token = new Token()
		token.id = createTokenDto.id
		token.blockchain = createTokenDto.blockchain
		token.name = createTokenDto.name
		token.symbol = createTokenDto.symbol
		token.decimals = createTokenDto.decimals
		token.coinmarketcapId = createTokenDto.coinmarketcapId

		return await this.repository.save(token)
	}

	async update(id: string, updateTokenDto: UpdateTokenDto, decimals?: number): Promise<void> {
		const partialToken: QueryDeepPartialEntity<Token> = {}
		if (updateTokenDto.name !== undefined) {
			partialToken.name = updateTokenDto.name
		}
		if (updateTokenDto.symbol !== undefined) {
			partialToken.symbol = updateTokenDto.symbol
		}
		if (updateTokenDto.decimals !== undefined) {
			partialToken.decimals = updateTokenDto.decimals
		}
		if (updateTokenDto.conjugatedAddress !== undefined) {
			partialToken.conjugatedAddress = updateTokenDto.conjugatedAddress
		}
		if (updateTokenDto.minSwapAmount !== undefined) {
			partialToken.minSwapAmount = new BigNumber(updateTokenDto.minSwapAmount).toFixed(
				decimals,
			)
		}
		if (updateTokenDto.maxSwapAmount !== undefined) {
			partialToken.maxSwapAmount = new BigNumber(updateTokenDto.maxSwapAmount).toFixed(
				decimals,
			)
		}
		if (updateTokenDto.coinmarketcapId !== undefined) {
			partialToken.coinmarketcapId = updateTokenDto.coinmarketcapId
		}
		if (updateTokenDto.price !== undefined) {
			partialToken.price = updateTokenDto.price.toString()
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

	async findOne(blockchain: Blockchain, address: string): Promise<Token | null> {
		return this.repository.findOneBy({
			blockchain,
			address,
		})
	}
}
