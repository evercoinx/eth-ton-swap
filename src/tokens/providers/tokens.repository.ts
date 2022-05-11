import { Injectable } from "@nestjs/common"
import { InjectRepository } from "@nestjs/typeorm"
import { Repository } from "typeorm"
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

	async update(id: string, updateTokenDto: UpdateTokenDto): Promise<void> {
		await this.repository.update(id, {
			price: updateTokenDto.price.toString(),
		})
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
