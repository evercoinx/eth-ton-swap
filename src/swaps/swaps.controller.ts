import { InjectQueue } from "@nestjs/bull"
import {
	Body,
	Controller,
	Get,
	Logger,
	NotFoundException,
	Param,
	Post,
	Query,
	ServiceUnavailableException,
	Sse,
} from "@nestjs/common"
import { Queue } from "bull"
import { InfuraProvider, InjectEthersProvider } from "nestjs-ethers"
import { Observable } from "rxjs"
import { EventsService } from "src/common/events.service"
import { TokensService } from "src/tokens/tokens.service"
import { GetWalletDto } from "src/wallets/dto/get-wallet.dto"
import { Wallet } from "src/wallets/wallet.entity"
import { WalletsService } from "src/wallets/wallets.service"
import {
	SOURCE_SWAP_CONFIRMATION_JOB,
	SOURCE_SWAPS_QUEUE,
	SWAP_CONFIRMATION_TTL,
} from "./constants"
import { ConfirmSourceSwapDto } from "./dto/confirm-source-swap.dto"
import { CreateSwapDto } from "./dto/create-swap.dto"
import { GetSwapDto } from "./dto/get-swap.dto"
import { Swap } from "./swap.entity"
import { SwapsService } from "./swaps.service"

@Controller("swaps")
export class SwapsController {
	private readonly logger = new Logger(SwapsController.name)

	constructor(
		private readonly swapsService: SwapsService,
		private readonly eventsService: EventsService,
		private readonly tokensService: TokensService,
		private readonly walletsService: WalletsService,
		@InjectQueue(SOURCE_SWAPS_QUEUE)
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

		const sourceWallet = await this.walletsService.findRandom(sourceToken.blockchain)
		if (!sourceWallet) {
			throw new NotFoundException("Source wallet is not found")
		}

		const destinationWallet = await this.walletsService.findRandom(destinationToken.blockchain)
		if (!destinationWallet) {
			throw new NotFoundException("Destination wallet is not found")
		}

		const swap = await this.swapsService.create(
			createSwapDto,
			sourceToken,
			destinationToken,
			sourceWallet,
			destinationWallet,
		)

		await this.addJobToQueue(swap.id)
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

	@Sse("events")
	events(@Query("swapId") swapId: string): Observable<any> {
		return this.eventsService.subscribe(swapId)
	}

	private async addJobToQueue(swapId: string): Promise<void> {
		const block = await this.infuraProvider.getBlock("latest")
		if (!block) {
			throw new ServiceUnavailableException("Unable to get latest block")
		}

		const jobData: ConfirmSourceSwapDto = {
			swapId,
			blockNumber: block.number,
			ttl: SWAP_CONFIRMATION_TTL,
		}
		await this.swapsQueue.add(SOURCE_SWAP_CONFIRMATION_JOB, jobData, {
			lifo: true,
		})
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
			wallet: this.toGetWalletDto(swap.sourceWallet),
			status: swap.status,
			orderedAt: swap.orderedAt.getTime(),
			createdAt: swap.createdAt.getTime(),
			updatedAt: swap.updatedAt.getTime(),
		}
	}

	private toGetWalletDto(wallet: Wallet): GetWalletDto {
		return {
			id: wallet.id,
			address: wallet.address,
		}
	}
}
