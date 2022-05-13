import {
	Body,
	CacheInterceptor,
	CacheTTL,
	Controller,
	Get,
	Logger,
	Param,
	ParseUUIDPipe,
	Post,
	Put,
	UseGuards,
	UseInterceptors,
} from "@nestjs/common"
import BigNumber from "bignumber.js"
import { JwtAuthGuard } from "src/auth/guards/jwt-auth.guard"
import { ERROR_TOKEN_ALREADY_EXISTS, ERROR_TOKEN_NOT_FOUND } from "src/common/constants"
import { ConflictException } from "src/common/exceptions/conflict.exception"
import { NotFoundException } from "src/common/exceptions/not-found.exception"
import { Quantity } from "src/common/providers/quantity"
import { CreateTokenDto } from "../dto/create-token.dto"
import { GetPublicTokenDto, GetTokenDto } from "../dto/get-token.dto"
import { UpdateTokenDto } from "../dto/update-token.dto"
import { CreateTokenPipe } from "../pipes/create-token.pipe"
import { TokensRepository } from "../providers/tokens.repository"
import { Token } from "../token.entity"

@Controller("tokens")
@UseInterceptors(CacheInterceptor)
export class TokensController {
	private readonly logger = new Logger(TokensController.name)

	constructor(private readonly tokensRepository: TokensRepository) {}

	@UseGuards(JwtAuthGuard)
	@Post()
	async createToken(@Body(CreateTokenPipe) createTokenDto: CreateTokenDto): Promise<GetTokenDto> {
		let token = await this.tokensRepository.findOne({
			blockchain: createTokenDto.blockchain,
			address: createTokenDto.address,
		})
		if (token) {
			throw new ConflictException(ERROR_TOKEN_ALREADY_EXISTS)
		}

		token = await this.tokensRepository.create({
			id: createTokenDto.id,
			blockchain: createTokenDto.blockchain,
			name: createTokenDto.name,
			symbol: createTokenDto.symbol,
			decimals: createTokenDto.decimals,
			address: createTokenDto.address,
			conjugatedAddress: createTokenDto.conjugatedAddress,
			minSwapAmount: new Quantity(createTokenDto.minSwapAmount, createTokenDto.decimals),
			maxSwapAmount: new Quantity(createTokenDto.maxSwapAmount, createTokenDto.decimals),
			coinmarketcapId: createTokenDto.coinmarketcapId,
		})
		this.logger.log(`${token.id}: Token created`)

		return this.toGetTokenDto(token)
	}

	@UseGuards(JwtAuthGuard)
	@Put(":id")
	async updateToken(
		@Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
		@Body() updateTokenDto: UpdateTokenDto,
	): Promise<GetTokenDto> {
		let token = await this.tokensRepository.findById(id)
		if (!token) {
			throw new ConflictException(ERROR_TOKEN_NOT_FOUND)
		}

		const decimals = updateTokenDto.decimals ?? token.decimals
		await this.tokensRepository.update(id, {
			name: updateTokenDto.name,
			symbol: updateTokenDto.symbol,
			decimals,
			conjugatedAddress: updateTokenDto.conjugatedAddress,
			minSwapAmount:
				updateTokenDto.minSwapAmount &&
				new Quantity(updateTokenDto.minSwapAmount, decimals),
			maxSwapAmount:
				updateTokenDto.maxSwapAmount &&
				new Quantity(updateTokenDto.maxSwapAmount, decimals),
			coinmarketcapId: updateTokenDto.coinmarketcapId,
			price: updateTokenDto.price && new BigNumber(updateTokenDto.price),
		})
		this.logger.log(`${token.id}: Token updated`)

		token = await this.tokensRepository.findById(id)
		return this.toGetTokenDto(token)
	}

	@Get()
	async getTokens(): Promise<GetPublicTokenDto[]> {
		const tokens = await this.tokensRepository.findAll()
		return tokens.map(this.toGetPublicTokenDto)
	}

	@UseGuards(JwtAuthGuard)
	@CacheTTL(0)
	@Get(":id")
	async getToken(
		@Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
	): Promise<GetTokenDto> {
		const token = await this.tokensRepository.findById(id)
		if (!token) {
			throw new NotFoundException(ERROR_TOKEN_NOT_FOUND)
		}
		return this.toGetTokenDto(token)
	}

	private toGetTokenDto(token: Token): GetTokenDto {
		return {
			...this.toGetPublicTokenDto(token),
			price: token.price,
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
