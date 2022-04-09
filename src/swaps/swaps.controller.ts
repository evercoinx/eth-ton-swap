import { InjectQueue } from "@nestjs/bull"
import {
	BadRequestException,
	Body,
	ConflictException,
	Controller,
	Delete,
	Get,
	HttpCode,
	HttpStatus,
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
import { getAddress, InfuraProvider, InjectEthersProvider } from "nestjs-ethers"
import { Observable } from "rxjs"
import { EventsService } from "src/common/events.service"
import { Blockchain } from "src/tokens/token.entity"
import { TokensService } from "src/tokens/tokens.service"
import { TonBlockchainProvider } from "src/ton/ton-blockchain.provider"
import { GetWalletDto } from "src/wallets/dto/get-wallet.dto"
import { Wallet, WalletType } from "src/wallets/wallet.entity"
import { WalletsService } from "src/wallets/wallets.service"
import {
	CONFIRM_ETH_SWAP_JOB,
	CONFIRM_TON_SWAP_JOB,
	ETH_SOURCE_SWAPS_QUEUE,
	MAX_PENDING_SWAP_COUNT_BY_IP,
	QUEUE_HIGH_PRIORITY,
	TON_SOURCE_SWAPS_QUEUE,
	TOTAL_CONFIRMATIONS,
} from "./constants"
import { IpAddress } from "../common/decorators/ip-address"
import { ConfirmSwapDto } from "./dto/confirm-swap.dto"
import { CreateSwapDto } from "./dto/create-swap.dto"
import { GetSwapDto } from "./dto/get-swap.dto"
import { CreateSwapPipe } from "./pipes/create-swap.pipe"
import { Swap, SwapStatus } from "./swap.entity"
import { SwapsService } from "./swaps.service"

@Controller("swaps")
export class SwapsController {
	private readonly logger = new Logger(SwapsController.name)

	constructor(
		@InjectEthersProvider() private readonly infuraProvider: InfuraProvider,
		@InjectQueue(ETH_SOURCE_SWAPS_QUEUE) private readonly ethSourceSwapsQueue: Queue,
		@InjectQueue(TON_SOURCE_SWAPS_QUEUE) private readonly tonSourceSwapsQueue: Queue,
		private readonly tonBlockchain: TonBlockchainProvider,
		private readonly swapsService: SwapsService,
		private readonly eventsService: EventsService,
		private readonly tokensService: TokensService,
		private readonly walletsService: WalletsService,
	) {}

	@Post()
	async createSwap(
		@Body(CreateSwapPipe) createSwapDto: CreateSwapDto,
		@IpAddress() ipAddress: string,
	): Promise<GetSwapDto> {
		const destinationToken = await this.tokensService.findById(createSwapDto.destinationTokenId)
		if (!destinationToken) {
			throw new NotFoundException("Destination token is not found")
		}

		createSwapDto.destinationAddress = this.normalizeAddress(
			createSwapDto.destinationAddress,
			destinationToken.blockchain,
		)

		const sourceToken = await this.tokensService.findById(createSwapDto.sourceTokenId)
		if (!sourceToken) {
			throw new NotFoundException("Source token is not found")
		}

		const pendingSwapCount = await this.swapsService.countByIpAddress(
			ipAddress,
			SwapStatus.Pending,
		)
		if (pendingSwapCount > MAX_PENDING_SWAP_COUNT_BY_IP) {
			this.logger.warn(`Too many pending swaps from IP: ${ipAddress}`)
			throw new ConflictException("There are too many pending swaps from your IP address")
		}

		const [destinationAmount, fee] = this.swapsService.calculateDestinationAmountAndFee(
			createSwapDto.sourceAmount,
			sourceToken,
			destinationToken,
		)

		const sourceWallet = await this.walletsService.findRandom(
			sourceToken.blockchain,
			WalletType.Transfer,
		)
		if (!sourceWallet) {
			this.logger.error(
				`Available source ${WalletType.Transfer} wallet in ${sourceToken.blockchain} not found`,
			)
			throw new NotFoundException(
				`Available source wallet in ${sourceToken.blockchain} is not found`,
			)
		}

		const destinationWallet = await this.walletsService.findRandom(
			destinationToken.blockchain,
			WalletType.Transfer,
			destinationAmount,
		)
		if (!destinationWallet) {
			this.logger.error(
				`Available destination ${WalletType.Transfer} wallet in ${destinationToken.blockchain} not found. ` +
					`User amount: ${destinationAmount} ${destinationToken.symbol}`,
			)
			throw new NotFoundException(
				`Available destination wallet in ${destinationToken.blockchain} is not found`,
			)
		}

		const collectorWallet = await this.walletsService.findRandom(
			sourceToken.blockchain,
			WalletType.Collector,
		)
		if (!collectorWallet) {
			this.logger.error(
				`Available source ${WalletType.Collector} wallet in ${sourceToken.blockchain} not found`,
			)
			throw new NotFoundException(
				`Available collector wallet in ${sourceToken.blockchain} is not found`,
			)
		}

		const swap = await this.swapsService.create(
			createSwapDto,
			destinationAmount,
			fee,
			sourceToken,
			destinationToken,
			sourceWallet,
			destinationWallet,
			collectorWallet,
			ipAddress,
		)
		this.logger.log(`${swap.id}: Swap created`)

		try {
			switch (swap.sourceToken.blockchain) {
				case Blockchain.Ethereum:
					await this.runConfirmEthSwapJob(swap.id)
					break
				case Blockchain.TON:
					await this.runConfirmTonSwapJob(swap.id)
					break
				default:
					await this.rejectUnsupportedBlockchain(swap.id, swap.sourceToken.blockchain)
			}
		} catch (err: unknown) {
			await this.swapsService.update(
				{
					id: swap.id,
					status: SwapStatus.Failed,
				},
				swap.sourceToken,
				swap.destinationToken,
			)
			throw err
		}

		return this.toGetSwapDto(swap)
	}

	@Delete(":id")
	@HttpCode(HttpStatus.NO_CONTENT)
	async cancelSwap(@Param("id") id: string): Promise<void> {
		const swap = await this.swapsService.findById(id)
		if (!swap) {
			throw new NotFoundException("Swap is not found")
		}

		if (swap.status === SwapStatus.Completed) {
			throw new ConflictException("Swap has been already completed")
		}

		if (swap.status !== SwapStatus.Pending) {
			throw new ConflictException("Swap is being processed now")
		}

		this.swapsService.update(
			{
				id: swap.id,
				status: SwapStatus.Canceled,
			},
			swap.sourceToken,
			swap.destinationToken,
		)

		return
	}

	@Get(":id")
	async getSwap(@Param("id") id: string): Promise<GetSwapDto> {
		const swap = await this.swapsService.findById(id)
		if (!swap) {
			throw new NotFoundException("Swap is not found")
		}

		return this.toGetSwapDto(swap)
	}

	@Sse("events")
	swapEvents(@Query("swapId") swapId: string): Observable<any> {
		return this.eventsService.subscribe(swapId)
	}

	private normalizeAddress(address: string, blockchain: Blockchain): string {
		let normalizedAddress = ""
		try {
			switch (blockchain) {
				case Blockchain.Ethereum:
					normalizedAddress = getAddress(address).replace(/^0x/, "")
					break
				case Blockchain.TON:
					normalizedAddress = this.tonBlockchain.normalizeAddress(address)
					break
			}
		} catch (err: unknown) {
			throw new BadRequestException(`An invalid address ${address} is specified`)
		}
		return normalizedAddress
	}

	private async runConfirmEthSwapJob(swapId: string): Promise<void> {
		try {
			const block = await this.infuraProvider.getBlock("latest")

			await this.ethSourceSwapsQueue.add(
				CONFIRM_ETH_SWAP_JOB,
				{
					swapId,
					blockNumber: block.number,
				} as ConfirmSwapDto,
				{
					lifo: true,
					priority: QUEUE_HIGH_PRIORITY,
				},
			)
		} catch (err: unknown) {
			this.logger.error(`${swapId}: Latest eth block not fetched: ${err}`)
			throw new ServiceUnavailableException(`We failed to fetch the latest Ethereum block`)
		}
	}

	private async runConfirmTonSwapJob(swapId: string): Promise<void> {
		try {
			const block = await this.tonBlockchain.getLatestBlock()

			await this.tonSourceSwapsQueue.add(
				CONFIRM_TON_SWAP_JOB,
				{
					swapId,
					blockNumber: block.number,
				} as ConfirmSwapDto,
				{
					lifo: true,
					priority: QUEUE_HIGH_PRIORITY,
				},
			)
		} catch (err: unknown) {
			this.logger.error(`${swapId}: Latest ton block not fetched: ${err}`)
			throw new ServiceUnavailableException("We failed to fetch the latest TON block")
		}
	}

	private async rejectUnsupportedBlockchain(
		swapId: string,
		blockchain: Blockchain,
	): Promise<void> {
		this.logger.error(`${swapId}: Blockchain ${blockchain} not supported`)
		throw new NotImplementedException(`Blockchain ${blockchain} is not supported`)
	}

	private toGetSwapDto(swap: Swap): GetSwapDto {
		return {
			id: swap.id,
			sourceTokenId: swap.sourceToken.id,
			sourceAddress: swap.sourceAddress,
			sourceAmount: swap.sourceAmount,
			sourceTransactionId: swap.sourceTransactionId,
			destinationTokenId: swap.destinationToken.id,
			destinationAddress: swap.destinationAddress,
			destinationConjugatedAddress: swap.destinationConjugatedAddress,
			destinationAmount: swap.destinationAmount,
			destinationTransactionId: swap.destinationTransactionId,
			wallet: this.toGetWalletDto(swap.sourceWallet),
			status: swap.status,
			currentConfirmations: swap.confirmations,
			totalConfirmations: TOTAL_CONFIRMATIONS,
			orderedAt: swap.orderedAt.getTime(),
			createdAt: swap.createdAt.getTime(),
			updatedAt: swap.updatedAt.getTime(),
			expiresAt: swap.expiresAt.getTime(),
		}
	}

	private toGetWalletDto(wallet: Wallet): GetWalletDto {
		return {
			id: wallet.id,
			address: wallet.address,
			conjugatedAddress: wallet.conjugatedAddress,
			type: wallet.type,
		}
	}
}
