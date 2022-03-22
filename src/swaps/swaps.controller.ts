import { InjectQueue } from "@nestjs/bull"
import {
	BadRequestException,
	Body,
	ConflictException,
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
import { ConfigService } from "@nestjs/config"
import BigNumber from "bignumber.js"
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
	QUEUE_HIGH_PRIORITY,
	TON_SOURCE_SWAPS_QUEUE,
} from "./constants"
import { IpAddress } from "../common/decorators/ip-address"
import { ConfirmSwapDto } from "./dto/confirm-swap.dto"
import { CreateSwapDto } from "./dto/create-swap.dto"
import { GetSwapDto } from "./dto/get-swap.dto"
import { Swap, SwapStatus } from "./swap.entity"
import { SwapsService } from "./swaps.service"

@Controller("swaps")
export class SwapsController {
	private readonly logger = new Logger(SwapsController.name)

	constructor(
		@InjectEthersProvider() private readonly infuraProvider: InfuraProvider,
		@InjectQueue(ETH_SOURCE_SWAPS_QUEUE) private readonly ethSourceSwapsQueue: Queue,
		@InjectQueue(TON_SOURCE_SWAPS_QUEUE) private readonly tonSourceSwapsQueue: Queue,
		private readonly configService: ConfigService,
		private readonly tonService: TonService,
		private readonly swapsService: SwapsService,
		private readonly eventsService: EventsService,
		private readonly tokensService: TokensService,
		private readonly walletsService: WalletsService,
	) {}

	@Post()
	async create(
		@Body() createSwapDto: CreateSwapDto,
		@IpAddress() ipAddress: string,
	): Promise<GetSwapDto> {
		const sourceAmount = new BigNumber(createSwapDto.sourceAmount)

		const minSwapAmount = this.configService.get<BigNumber>("bridge.minSwapAmount")
		if (sourceAmount.lt(minSwapAmount)) {
			throw new BadRequestException(
				`${createSwapDto.sourceAmount} is below the minimum allowed swap amount`,
			)
		}

		const maxSwapAmount = this.configService.get<BigNumber>("bridge.maxSwapAmount")
		if (sourceAmount.gt(maxSwapAmount)) {
			throw new BadRequestException(
				`${createSwapDto.sourceAmount} is above the maximum allowed swap amount`,
			)
		}

		const pendingSwap = await this.swapsService.findByIpAddress(ipAddress, SwapStatus.Pending)
		if (pendingSwap) {
			throw new ConflictException("There already exists a pending swap")
		}

		const sourceToken = await this.tokensService.findById(createSwapDto.sourceTokenId)
		if (!sourceToken) {
			throw new NotFoundException("Source token is not found")
		}

		const destinationToken = await this.tokensService.findById(createSwapDto.destinationTokenId)
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
			ipAddress,
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
				await this.rejectUnsupportedBlockchain(swap)
		}

		return this.toGetSwapDto(swap)
	}

	@Get(":id")
	async findOne(@Param("id") id: string): Promise<GetSwapDto> {
		const swap = await this.swapsService.findById(id)
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
			this.logger.error(`Unable to get latest eth block: ${err}`)
			throw new ServiceUnavailableException(`Unable to get the latest Ethereum block`)
		}
	}

	private async runConfirmTonSwapJob(swapId: string): Promise<void> {
		try {
			const block = await this.tonService.getLatestBlock()

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
			this.logger.error(`Unable to get latest ton block: ${err}`)
			throw new ServiceUnavailableException("Unable to get the latest TON block")
		}
	}

	private async rejectUnsupportedBlockchain(swap: Swap): Promise<void> {
		await this.swapsService.update(
			{
				id: swap.id,
				status: SwapStatus.Failed,
			},
			swap.sourceToken,
			swap.destinationToken,
		)
		this.logger.error(
			`Unsupported blockchain ${swap.sourceToken.blockchain} for swap ${swap.id}`,
		)
		throw new NotImplementedException(`Unsupported blockchain ${swap.sourceToken.blockchain}`)
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
			destinationAmount: swap.destinationAmount,
			destinationTransactionId: swap.destinationTransactionId,
			wallet: this.toGetWalletDto(swap.sourceWallet),
			status: swap.status,
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
			type: wallet.type,
		}
	}
}
