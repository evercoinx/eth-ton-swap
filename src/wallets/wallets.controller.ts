import { Body, Controller, Get, Logger, NotFoundException, Post, UseGuards } from "@nestjs/common"
import { JwtAuthGuard } from "src/auth/guards/jwt-auth.guard"
import { TokensService } from "src/tokens/tokens.service"
import { CreateWalletDto } from "./dto/create-wallet.dto"
import { GetWalletDto } from "./dto/get-wallet.dto"
import { Wallet } from "./wallet.entity"
import { WalletsService } from "./wallets.service"

@Controller("wallets")
export class WalletsController {
	private readonly logger = new Logger(WalletsController.name)

	constructor(
		private readonly tokensSerivce: TokensService,
		private readonly walletsService: WalletsService,
	) {}

	@UseGuards(JwtAuthGuard)
	@Post()
	async create(@Body() createWalletDto: CreateWalletDto): Promise<GetWalletDto> {
		const token = await this.tokensSerivce.findOne(createWalletDto.tokenId)
		if (!token) {
			throw new NotFoundException("Token is not found")
		}

		const wallet = await this.walletsService.create(
			token,
			createWalletDto.secretKey,
			createWalletDto.address,
		)
		this.logger.log(`Wallet ${wallet.address} created successfully`)
		return this.toGetWalletDto(wallet)
	}

	@UseGuards(JwtAuthGuard)
	@Get()
	async findAll(): Promise<GetWalletDto[]> {
		const wallets = await this.walletsService.findAll()
		return wallets.map(this.toGetWalletDto)
	}

	private toGetWalletDto(wallet: Wallet): GetWalletDto {
		return {
			id: wallet.id,
			address: wallet.address,
			secretKey: wallet.secretKey,
			createdAt: wallet.createdAt.getTime(),
		}
	}
}
