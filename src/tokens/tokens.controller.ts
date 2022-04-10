import {
	Body,
	CacheInterceptor,
	Controller,
	Get,
	Logger,
	NotFoundException,
	Param,
	Post,
	UseGuards,
	UseInterceptors,
} from "@nestjs/common"
import { JwtAuthGuard } from "src/auth/guards/jwt-auth.guard"
import { CreateTokenDto } from "./dto/create-token.dto"
import { GetTokenDto } from "./dto/get-token.dto"
import { CreateTokenPipe } from "./pipes/create-token.pipe"
import { Token } from "./token.entity"
import { TokensService } from "./tokens.service"

@Controller("tokens")
@UseInterceptors(CacheInterceptor)
export class TokensController {
	private readonly logger = new Logger(TokensController.name)

	constructor(private readonly tokensService: TokensService) {}

	@UseGuards(JwtAuthGuard)
	@Post()
	async createToken(@Body(CreateTokenPipe) createTokenDto: CreateTokenDto): Promise<GetTokenDto> {
		const token = await this.tokensService.create(createTokenDto)
		this.logger.log(`Token ${token.name} created successfully`)
		return this.toGetTokenDto(token)
	}

	@Get()
	async getTokens(): Promise<GetTokenDto[]> {
		const tokens = await this.tokensService.findAll()
		return tokens.map(this.toGetTokenDto)
	}

	@Get(":id")
	async getToken(@Param("id") id: string): Promise<GetTokenDto> {
		const token = await this.tokensService.findById(id)
		if (!token) {
			throw new NotFoundException("Token is not found")
		}
		return this.toGetTokenDto(token)
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
