import { InjectQueue } from "@nestjs/bull"
import {
	Body,
	Controller,
	Get,
	Logger,
	NotFoundException,
	NotImplementedException,
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
import { Blockchain } from "src/tokens/token.entity"
import { TokensService } from "src/tokens/tokens.service"
import { TonService } from "src/ton/ton.service"
import { GetWalletDto } from "src/wallets/dto/get-wallet.dto"
import { Wallet, WalletType } from "src/wallets/wallet.entity"
import { WalletsService } from "src/wallets/wallets.service"
import {
	CONFIRM_ETH_SWAP_JOB,
	CONFIRM_TON_SWAP_JOB,
	ETH_SOURCE_SWAPS_QUEUE,
	SWAP_CONFIRMATION_TTL,
	TON_SOURCE_SWAPS_QUEUE,
} from "./constants"
import { ConfirmSwapDto } from "./dto/confirm-swap.dto"
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
		private readonly tonService: TonService,
		@InjectQueue(ETH_SOURCE_SWAPS_QUEUE)
		private readonly ethSourceSwapsQueue: Queue,
		@InjectQueue(TON_SOURCE_SWAPS_QUEUE)
		private readonly tonSourceSwapsQueue: Queue,
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

		const sourceWallet = await this.walletsService.findRandom(
			sourceToken.blockchain,
			WalletType.Transfer,
		)
		if (!sourceWallet) {
			throw new NotFoundException("Source wallet is not found")
		}

		const destinationWallet = await this.walletsService.findRandom(
			destinationToken.blockchain,
			WalletType.Transfer,
		)
		if (!destinationWallet) {
			throw new NotFoundException("Destination wallet is not found")
		}

		const collectorWallet = await this.walletsService.findRandom(
			sourceToken.blockchain,
			WalletType.Collector,
		)
		if (!collectorWallet) {
			throw new NotFoundException("Collector wallet is not found")
		}

		const swap = await this.swapsService.create(
			createSwapDto,
			sourceToken,
			destinationToken,
			sourceWallet,
			destinationWallet,
			collectorWallet,
		)
		this.logger.log(
			`Swap ${swap.sourceAmount} ${swap.sourceToken.symbol} to ${swap.destinationAddress} created successfully`,
		)

		switch (swap.sourceToken.blockchain) {
			case Blockchain.Ethereum:
				await this.runConfirmEthSwapJob(swap.id)
				break
			case Blockchain.TON:
				await this.runConfirmTonSwapJob(swap.id)
				break
			default:
				this.logger.error(
					`Unsupported blockchain ${swap.sourceToken.blockchain} for swap ${swap.id}`,
				)
				throw new NotImplementedException(
					`Unsupported blockchain ${swap.sourceToken.blockchain}`,
				)
		}

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

	private async runConfirmEthSwapJob(swapId: string): Promise<void> {
		const block = await this.infuraProvider.getBlock("latest")
		if (!block) {
			throw new ServiceUnavailableException("Unable to get latest block")
		}

		await this.ethSourceSwapsQueue.add(
			CONFIRM_ETH_SWAP_JOB,
			{
				swapId,
				ttl: SWAP_CONFIRMATION_TTL,
				blockNumber: block.number,
			} as ConfirmSwapDto,
			{
				lifo: true,
				priority: 1,
			},
		)
	}

	private async runConfirmTonSwapJob(swapId: string): Promise<void> {
		const block = await this.tonService.getBlock()
		if (!block) {
			throw new ServiceUnavailableException("Unable to get latest block")
		}

		await this.tonSourceSwapsQueue.add(
			CONFIRM_TON_SWAP_JOB,
			{
				swapId,
				ttl: SWAP_CONFIRMATION_TTL,
				blockNumber: block.number,
			} as ConfirmSwapDto,
			{
				lifo: true,
				priority: 1,
			},
		)
	}

	private toGetSwapDto(swap: Swap): GetSwapDto {
		return {
			id: swap.id,
			sourceTokenId: swap.sourceToken.id,
			sourceAddress: swap.sourceAddress,
			sourceAmount: swap.sourceAmount,
			sourceTransactionHash: swap.sourceTransactionHash,
			destinationTokenId: swap.destinationToken.id,
			destinationAddress: swap.destinationAddress,
			destinationAmount: swap.destinationAmount,
			destinationTransactionHash: swap.destinationTransactionHash,
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
			type: wallet.type,
		}
	}
}
