import { Body, Controller, Get, Param, Post } from "@nestjs/common"
import { CreateSwapDto } from "./dto/create-swap.dto"
import { GetSwapDto } from "./dto/get-swap.dto"
import { GetWalletDto } from "../wallets/dto/get-wallet.dto"
import { Swap } from "./swap.entity"
import { Wallet } from "../wallets/wallet.entity"
import { SwapsService } from "./swaps.service"
import { WalletsService } from "../wallets/wallets.service"

@Controller("swaps")
export class SwapsController {
	constructor(
		private readonly swapsService: SwapsService,
		private readonly walletsService: WalletsService,
	) {}

	@Post()
	async create(@Body() createSwapDto: CreateSwapDto): Promise<GetSwapDto> {
		const wallets = await this.walletsService.findAll({
			blockchain: createSwapDto.destinationBlockchain,
			token: createSwapDto.destinationToken,
		})
		const wallet = wallets[0]

		const swap = await this.swapsService.create(createSwapDto, wallet)
		return this.toGetSwapDto(swap)
	}

	@Get(":id")
	async findOne(@Param("id") id: string): Promise<GetSwapDto> {
		const swap = await this.swapsService.findOne(id)
		return this.toGetSwapDto(swap)
	}

	private toGetSwapDto(swap: Swap): GetSwapDto {
		const { wallet } = swap
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
			wallet: this.toGetWalletDto(wallet),
			orderedAt: swap.orderedAt.getTime(),
			createdAt: swap.createdAt.getTime(),
		}
	}

	private toGetWalletDto(wallet: Wallet): GetWalletDto {
		return {
			blockchain: wallet.blockchain,
			token: wallet.token,
			address: wallet.address,
		}
	}
}
