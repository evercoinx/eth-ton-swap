import { Body, Controller, Get, Logger, NotFoundException, Param, Post } from "@nestjs/common"
import { CreateSwapDto } from "./dto/create-swap.dto"
import { GetSwapDto } from "./dto/get-swap.dto"
import { GetWalletDto } from "../wallets/dto/get-wallet.dto"
import { Swap } from "./swap.entity"
import { Wallet } from "../wallets/wallet.entity"
import { SwapsService } from "./swaps.service"
import { WalletsService } from "../wallets/wallets.service"

@Controller("swaps")
export class SwapsController {
	private readonly logger = new Logger(SwapsController.name)

	constructor(
		private readonly swapsService: SwapsService,
		private readonly walletsService: WalletsService,
	) {}

	@Post()
	async create(@Body() createSwapDto: CreateSwapDto): Promise<GetSwapDto> {
		const wallets = await this.walletsService.findAll({
			blockchain: createSwapDto.sourceBlockchain,
			token: createSwapDto.sourceToken,
		})
		if (!wallets.length) {
			throw new NotFoundException("Wallet is not found")
		}

		const randomIndex = Math.floor(Math.random() * wallets.length)
		const wallet = wallets[randomIndex]

		const swap = await this.swapsService.create(createSwapDto, wallet)
		this.logger.log(
			`Swap ${swap.sourceAmount} ${swap.sourceToken} to ${swap.destinationAddress} created successfully`,
		)
		return this.toGetSwapDto(swap)
	}

	@Get(":id")
	async findOne(@Param("id") id: string): Promise<GetSwapDto> {
		const swap = await this.swapsService.findOne(id)
		if (!swap) {
			throw new NotFoundException("Swap is not found")
		}

		return this.toGetSwapDto(swap)
	}

	private toGetSwapDto(swap: Swap): GetSwapDto {
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
			wallet: this.toGetWalletDto(swap.wallet),
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
