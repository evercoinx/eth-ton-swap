import { Injectable } from "@nestjs/common"
import { InjectRepository } from "@nestjs/typeorm"
import { getAddress } from "nestjs-ethers"
import { Repository } from "typeorm"
import { TonBlockchainProvider } from "src/ton/ton-blockchain.provider"
import { CreateTokenDto } from "./dto/create-token.dto"
import { UpdateTokenDto } from "./dto/update-token.dto"
import { Blockchain, Token } from "./token.entity"

@Injectable()
export class TokensService {
	constructor(
		@InjectRepository(Token) private readonly tokenRepository: Repository<Token>,
		private readonly tonBlockchain: TonBlockchainProvider,
	) {}

	async create(createTokenDto: CreateTokenDto): Promise<Token> {
		const token = new Token()
		token.id = createTokenDto.id
		token.blockchain = createTokenDto.blockchain
		token.name = createTokenDto.name
		token.symbol = createTokenDto.symbol
		token.decimals = createTokenDto.decimals
		token.coinmarketcapId = createTokenDto.coinmarketcapId

		switch (createTokenDto.blockchain) {
			case Blockchain.Ethereum:
				token.address = getAddress(createTokenDto.address).replace(/^0x/, "")
				break
			case Blockchain.TON:
				token.address = this.tonBlockchain.normalizeAddress(createTokenDto.address)
				token.conjugatedAddress = this.tonBlockchain.normalizeAddress(
					createTokenDto.conjugatedAddress,
				)
				break
		}

		return await this.tokenRepository.save(token)
	}

	async update(id: string, updateTokenDto: UpdateTokenDto): Promise<void> {
		await this.tokenRepository.update(id, {
			price: updateTokenDto.price.toString(),
		})
	}

	async findById(id: string): Promise<Token | undefined> {
		return this.tokenRepository.findOne(id)
	}

	async findAll(): Promise<Token[]> {
		return this.tokenRepository.find({
			order: {
				blockchain: 1,
				name: 1,
			},
		})
	}
}
