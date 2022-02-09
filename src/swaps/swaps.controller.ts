import { Body, Controller, Get, Param, Post } from "@nestjs/common"
import { CreateSwapDto } from "./dto/create-swap.dto"
import { GetSwapDto } from "./dto/get-swap.dto"
import { Swap } from "./swap.entity"
import { SwapsService } from "./swaps.service"
import { WalletsService } from "../wallets/wallets.service"
import { Wallet } from "../wallets/wallet.entity"

@Controller("swaps")
export class SwapsController {
	constructor(
		private readonly swapsService: SwapsService,
		private readonly walletsService: WalletsService,
	) {}

	@Post()
	async create(@Body() createSwapDto: CreateSwapDto): Promise<GetSwapDto> {
		const wallets = await this.walletsService.findAll()
		const wallet = wallets[0]
		const swap = await this.swapsService.create(createSwapDto, wallet)
		return this.toGetSwapDto(swap, wallet)
	}

	@Get(":id")
	async findOne(@Param("id") id: string): Promise<GetSwapDto> {
		const swap = await this.swapsService.findOne(id)
		console.log(swap.wallet)
		const wallet = await this.walletsService.findOne(swap.wallet.id)
		return this.toGetSwapDto(swap, wallet)
	}

	private toGetSwapDto(swap: Swap, wallet: Wallet): GetSwapDto {
		return {
			id: swap.id,
			sourceBlockchain: swap.sourceBlockchain,
			sourceAddress: swap.sourceAddress,
			sourceToken: swap.sourceToken,
			sourceAmount: swap.sourceAmount,
			destinationBlockchain: swap.destinationBlockchain,
			destinationToken: swap.destinationToken,
			destinationAddress: swap.destinationAddress,
			destinationAmount: swap.destinationAmount,
			wallet: {
				id: wallet.id,
				blockchain: wallet.blockchain,
				token: wallet.token,
				address: wallet.address,
				registeredAt: wallet.registeredAt.getTime(),
			},
			createdAt: swap.createdAt.getTime(),
			registeredAt: swap.registeredAt.getTime(),
		}
	}
}
