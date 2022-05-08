import { Injectable } from "@nestjs/common"
import { InjectRepository } from "@nestjs/typeorm"
import BigNumber from "bignumber.js"
import { Repository } from "typeorm"
import { Blockchain } from "src/common/enums/blockchain.enum"
import { EthereumBlockchainProvider } from "src/ethereum/ethereum-blockchain.provider"
import { TonBlockchainService } from "src/ton/providers/ton-blockchain.service"
import { CreateTokenDto } from "./dto/create-token.dto"
import { UpdateTokenDto } from "./dto/update-token.dto"
import { Token } from "./token.entity"

@Injectable()
export class TokensService {
	constructor(
		@InjectRepository(Token) private readonly tokenRepository: Repository<Token>,
		private readonly ethereumBlockchain: EthereumBlockchainProvider,
		private readonly tonBlockchain: TonBlockchainService,
	) {}

	async create(createTokenDto: CreateTokenDto): Promise<Token> {
		const token = new Token()
		token.id = createTokenDto.id
		token.blockchain = createTokenDto.blockchain
		token.name = createTokenDto.name
		token.symbol = createTokenDto.symbol
		token.decimals = createTokenDto.decimals
		token.minSwapAmount = new BigNumber(createTokenDto.minSwapAmount).toFixed(
			createTokenDto.decimals,
		)
		token.maxSwapAmount = new BigNumber(createTokenDto.maxSwapAmount).toFixed(
			createTokenDto.decimals,
		)
		token.coinmarketcapId = createTokenDto.coinmarketcapId

		switch (createTokenDto.blockchain) {
			case Blockchain.Ethereum: {
				token.address = this.ethereumBlockchain.normalizeAddress(createTokenDto.address)
				break
			}
			case Blockchain.TON: {
				token.address = this.tonBlockchain.normalizeAddress(createTokenDto.address)
				token.conjugatedAddress = this.tonBlockchain.normalizeAddress(
					createTokenDto.conjugatedAddress,
				)
				break
			}
		}

		return await this.tokenRepository.save(token)
	}

	async update(id: string, updateTokenDto: UpdateTokenDto): Promise<void> {
		await this.tokenRepository.update(id, {
			price: updateTokenDto.price.toString(),
		})
	}

	async findAll(): Promise<Token[]> {
		return this.tokenRepository.find({
			order: {
				blockchain: 1,
				name: 1,
			},
		})
	}

	async findById(id: string): Promise<Token | null> {
		return this.tokenRepository.findOneBy({ id })
	}

	async findOne(blockchain: Blockchain, address: string): Promise<Token | undefined> {
		return this.tokenRepository.findOneBy({
			blockchain,
			address,
		})
	}
}
