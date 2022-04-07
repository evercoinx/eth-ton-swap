import {
	Body,
	CacheInterceptor,
	Controller,
	Get,
	Logger,
	Post,
	UseGuards,
	UseInterceptors,
} from "@nestjs/common"
import { JwtAuthGuard } from "src/auth/guards/jwt-auth.guard"
import { CreateTokenDto } from "./dto/create-token.dto"
import { GetTokenDto } from "./dto/get-token.dto"
import { Token } from "./token.entity"
import { TokensService } from "./tokens.service"

@Controller("tokens")
@UseInterceptors(CacheInterceptor)
export class TokensController {
	private readonly logger = new Logger(TokensController.name)

	constructor(private readonly tokensService: TokensService) {}

	@UseGuards(JwtAuthGuard)
	@Post()
	async createToken(@Body() createTokenDto: CreateTokenDto): Promise<GetTokenDto> {
		const token = await this.tokensService.create(createTokenDto)
		this.logger.log(`Token ${token.name} created successfully`)
		return this.toGetTokenDto(token)
	}

	@Get()
	async getTokens(): Promise<GetTokenDto[]> {
		const tokens = await this.tokensService.findAll()
		return tokens.map(this.toGetTokenDto)
	}

	private toGetTokenDto(token: Token): GetTokenDto {
		return {
			id: token.id,
			blockchain: token.blockchain,
			name: token.name,
			symbol: token.symbol,
			decimals: token.decimals,
			address: token.address,
		}
	}
}
