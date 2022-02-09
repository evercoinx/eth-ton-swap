import { Body, Controller, Get, Post, Query } from "@nestjs/common"
import { CreateWalletDto } from "./dto/create-wallet.dto"
import { GetWalletDto } from "./dto/get-wallet.dto"
import { ListWalletsDto } from "./dto/list-wallets.dto"
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
	async findAll(@Query() query: ListWalletsDto): Promise<GetWalletDto[]> {
		const wallets = await this.walletsService.findAll(query)
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
