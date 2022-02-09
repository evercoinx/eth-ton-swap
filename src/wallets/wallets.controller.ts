import { Body, Controller, Get, Post } from "@nestjs/common"
import { CreateWalletDto } from "./dto/create-wallet.dto"
import { GetWalletDto } from "./dto/get-wallet.dto"
import { Wallet } from "./wallet.entity"
import { WalletConditions, WalletsService } from "./wallets.service"

@Controller("wallets")
export class WalletsController {
	constructor(private readonly walletsService: WalletsService) {}

	@Post()
	async create(@Body() createWalletDto: CreateWalletDto): Promise<GetWalletDto> {
		const wallet = await this.walletsService.create(createWalletDto)
		return this.toGetWalletDto(wallet)
	}

	@Get()
	async findAll(conditions: WalletConditions): Promise<GetWalletDto[]> {
		const wallets = await this.walletsService.findAll(conditions)
		return wallets.map(this.toGetWalletDto)
	}

	private toGetWalletDto(wallet: Wallet): GetWalletDto {
		return {
			blockchain: wallet.blockchain,
			token: wallet.token,
			address: wallet.address,
		}
	}
}
