import { Injectable } from "@nestjs/common"
import { InjectRepository } from "@nestjs/typeorm"
import { Repository } from "typeorm"
import { CreateTokenDto } from "./dto/create-token.dto"
import { UpdateTokenDto } from "./dto/update-token.dto"
import { Token } from "./token.entity"

@Injectable()
export class TokensService {
	constructor(
		@InjectRepository(Token)
		private readonly tokenRepository: Repository<Token>,
	) {}

	async create(createTokenDto: CreateTokenDto): Promise<Token> {
		const token = new Token()
		token.name = createTokenDto.name
		token.symbol = createTokenDto.symbol
		token.decimals = createTokenDto.decimals
		token.blockchain = createTokenDto.blockchain
		token.coinmarketcapId = createTokenDto.coinmarketcapId
		token.updatedAt = new Date()

		return await this.tokenRepository.save(token)
	}

	async update(updateTokenDto: UpdateTokenDto): Promise<void> {
		await this.tokenRepository.update(updateTokenDto.id, {
			price: updateTokenDto.price.toString(),
			updatedAt: new Date(),
		})
	}

	async findOne(id: string): Promise<Token | undefined> {
		return this.tokenRepository.findOne(id)
	}

	async findAll(): Promise<Token[]> {
		return this.tokenRepository.find()
	}
}
