import {
	Body,
	CacheInterceptor,
	CacheTTL,
	ConflictException,
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
import { GetPublicTokenDto, GetTokenDto } from "./dto/get-token.dto"
import { CreateTokenPipe } from "./pipes/create-token.pipe"
import { TokensRepository } from "./providers/tokens.repository"
import { SyncTokensPriceTask } from "./tasks/sync-tokens-price.task"
import { Token } from "./token.entity"

@Controller("tokens")
@UseInterceptors(CacheInterceptor)
export class TokensController {
	private readonly logger = new Logger(TokensController.name)

	constructor(
		private readonly tokensRepository: TokensRepository,
		private readonly syncTokensPriceTask: SyncTokensPriceTask,
	) {}

	@UseGuards(JwtAuthGuard)
	@Post()
	async createToken(@Body(CreateTokenPipe) createTokenDto: CreateTokenDto): Promise<GetTokenDto> {
		const token = await this.tokensRepository.findOne(
			createTokenDto.blockchain,
			createTokenDto.address,
		)
		if (token) {
			throw new ConflictException("Token already exists")
		}

		const newToken = await this.tokensRepository.create(createTokenDto)
		this.logger.log(
			`Token ${newToken.symbol} at ${newToken.address} created in ${newToken.blockchain}`,
		)
		return this.toGetTokenDto(newToken)
	}

	@UseGuards(JwtAuthGuard)
	@Post("/sync-price")
	async syncTokensPrice(): Promise<void> {
		this.syncTokensPriceTask.run()
	}

	@Get()
	async getTokens(): Promise<GetPublicTokenDto[]> {
		const tokens = await this.tokensRepository.findAll()
		return tokens.map(this.toGetPublicTokenDto)
	}

	@UseGuards(JwtAuthGuard)
	@CacheTTL(3600)
	@Get(":id")
	async getToken(@Param("id") id: string): Promise<GetTokenDto> {
		const token = await this.tokensRepository.findById(id)
		if (!token) {
			throw new NotFoundException("Token is not found")
		}
		return this.toGetTokenDto(token)
	}

	private toGetTokenDto(token: Token): GetTokenDto {
		return {
			...this.toGetPublicTokenDto(token),
			createdAt: token.createdAt.getTime(),
			updatedAt: token.updatedAt.getTime(),
		}
	}

	private toGetPublicTokenDto(token: Token): GetPublicTokenDto {
		return {
			id: token.id,
			blockchain: token.blockchain,
			name: token.name,
			symbol: token.symbol,
			decimals: token.decimals,
			address: token.address,
			conjugatedAddress: token.conjugatedAddress,
			minSwapAmount: token.minSwapAmount,
			maxSwapAmount: token.maxSwapAmount,
		}
	}
}
