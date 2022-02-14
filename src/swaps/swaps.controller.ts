import { InjectQueue } from "@nestjs/bull"
import {
	Body,
	Controller,
	Get,
	Logger,
	NotFoundException,
	Param,
	Post,
	ServiceUnavailableException,
} from "@nestjs/common"
import { Queue } from "bull"
import { InfuraProvider, InjectEthersProvider } from "nestjs-ethers"
import { SWAP_CONFIRMATION, SWAPS_QUEUE } from "./contstants"
import { CreateSwapDto } from "./dto/create-swap.dto"
import { GetSwapDto } from "./dto/get-swap.dto"
import { Swap } from "./swap.entity"
import { SwapsService } from "./swaps.service"
import { TokensService } from "src/tokens/tokens.service"
import { GetWalletDto } from "src/wallets/dto/get-wallet.dto"
import { Wallet } from "src/wallets/wallet.entity"
import { WalletsService } from "src/wallets/wallets.service"
import { SwapConfirmation } from "./interfaces/swap-confirmation"

@Controller("swaps")
export class SwapsController {
	private readonly logger = new Logger(SwapsController.name)

	constructor(
		private readonly swapsService: SwapsService,
		private readonly tokensService: TokensService,
		private readonly walletsService: WalletsService,
		@InjectQueue(SWAPS_QUEUE)
		private readonly swapsQueue: Queue,
		@InjectEthersProvider()
		private readonly infuraProvider: InfuraProvider,
	) {}

	@Post()
	async create(@Body() createSwapDto: CreateSwapDto): Promise<GetSwapDto> {
		const sourceToken = await this.tokensService.findOne(createSwapDto.sourceTokenId)
		if (!sourceToken) {
			throw new NotFoundException("Source token is not found")
		}

		const destinationToken = await this.tokensService.findOne(createSwapDto.destinationTokenId)
		if (!destinationToken) {
			throw new NotFoundException("Destination token is not found")
		}

		const wallet = await this.walletsService.findRandom()
		if (!wallet) {
			throw new NotFoundException("Wallet is not found")
		}

		const swap = await this.swapsService.create(
			createSwapDto,
			sourceToken,
			destinationToken,
			wallet,
		)

		const block = await this.infuraProvider.getBlock("latest")
		if (!block) {
			throw new ServiceUnavailableException("Unable to get latest block")
		}

		const swapConfirmation: SwapConfirmation = {
			swapId: swap.id,
			tokenAddress: wallet.token.address,
			walletAddress: wallet.address,
			trackingBlock: block.number,
			attempt: 1,
		}
		await this.swapsQueue.add(SWAP_CONFIRMATION, swapConfirmation, {
			delay: 3000,
		})

		this.logger.log(
			`Swap ${swap.sourceAmount} ${swap.sourceToken.symbol} to ${swap.destinationAddress} created successfully`,
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
			sourceTokenId: swap.sourceToken.id,
			sourceAddress: swap.sourceAddress,
			sourceAmount: swap.sourceAmount,
			destinationTokenId: swap.destinationToken.id,
			destinationAddress: swap.destinationAddress,
			destinationAmount: swap.destinationAmount,
			wallet: this.toGetWalletDto(swap.wallet),
			orderedAt: swap.orderedAt.getTime(),
			createdAt: swap.createdAt.getTime(),
		}
	}

	private toGetWalletDto(wallet: Wallet): GetWalletDto {
		return {
			id: wallet.id,
			address: wallet.address,
		}
	}
}
