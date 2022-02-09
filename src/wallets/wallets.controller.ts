import { Body, Controller, Get, Post } from "@nestjs/common"
import { CreateWalletDto } from "./dto/create-wallet.dto"
import { GetWalletDto } from "./dto/get-wallet.dto"
import { Wallet } from "./wallet.entity"
import { WalletsService } from "./wallets.service"

@Controller("wallets")
export class WalletsController {
	constructor(private readonly walletsService: WalletsService) {}

	@Post()
	async create(@Body() createWalletDto: CreateWalletDto): Promise<GetWalletDto> {
		const wallet = await this.walletsService.create(createWalletDto)
		return this.toGetWalletDto(wallet)
	}

	@Get()
	async findAll(): Promise<GetWalletDto[]> {
		const wallets = await this.walletsService.findAll()
		return wallets.map(this.toGetWalletDto)
	}

	private toGetWalletDto(wallet: Wallet): GetWalletDto {
		return {
			id: wallet.id,
			blockchain: wallet.blockchain,
			token: wallet.token,
			address: wallet.address,
			createdAt: wallet.createdAt.getTime(),
		}
	}
}
