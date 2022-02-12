import { Body, Controller, Get, Logger, Post } from "@nestjs/common"
import { CreateTokenDto } from "./dto/create-token.dto"
import { GetTokenDto } from "./dto/get-token.dto"
import { Token } from "./token.entity"
import { TokensService } from "./tokens.service"

@Controller("tokens")
export class TokensController {
	private readonly logger = new Logger(TokensController.name)

	constructor(private readonly tokensService: TokensService) {}

	@Post()
	async create(@Body() createTokenDto: CreateTokenDto): Promise<GetTokenDto> {
		const token = await this.tokensService.create(createTokenDto)
		this.logger.log(`Token ${token.name} created successfully`)
		return this.toGetTokenDto(token)
	}

	@Get()
	async findAll(): Promise<GetTokenDto[]> {
		const tokens = await this.tokensService.findAll()
		return tokens.map(this.toGetTokenDto)
	}

	private toGetTokenDto(token: Token): GetTokenDto {
		return {
			id: token.id,
			name: token.name,
			symbol: token.symbol,
			decimals: token.decimals,
			blockchain: token.blockchain,
		}
	}
}
