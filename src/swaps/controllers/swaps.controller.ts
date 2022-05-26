import * as TraceAgent from "@google-cloud/trace-agent"
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
	Ip,
	Logger,
	NotFoundException,
	Param,
	ParseUUIDPipe,
	Post,
	Query,
	Sse,
	UnprocessableEntityException,
	UseGuards,
	UseInterceptors,
} from "@nestjs/common"
import BigNumber from "bignumber.js"
import { Queue } from "bull"
import { Observable } from "rxjs"
import { JwtAuthGuard } from "src/auth/guards/jwt-auth.guard"
import {
	ERROR_BLOCKCHAIN_CONNECTION_LOST,
	ERROR_BLOCKCHAIN_NOT_SUPPORTED,
	ERROR_COLLECTOR_WALLLET_NOT_AVAILABLE,
	ERROR_DESTINATION_WALLLET_NOT_AVAILABLE,
	ERROR_INVALID_ADDRESS,
	ERROR_SOURCE_WALLLET_NOT_AVAILABLE,
	ERROR_SWAP_ALREADY_COMPLETED,
	ERROR_SWAP_AMOUNT_TOO_HIGH,
	ERROR_SWAP_AMOUNT_TOO_LOW,
	ERROR_SWAP_IN_PROGRESS,
	ERROR_SWAP_NOT_FOUND,
	ERROR_TOKEN_NOT_FOUND,
	ERROR_TOO_MANY_REQUESTS,
	getStatusCode,
	QUEUE_HIGH_PRIORITY,
} from "src/common/constants"
import { Blockchain } from "src/common/enums/blockchain.enum"
import { TracerInterceptor } from "src/common/interceptors/tracer.interceptor"
import { Event } from "src/common/interfaces/event.interface"
import { EventsService } from "src/common/providers/events.service"
import { Quantity } from "src/common/providers/quantity"
import { EthereumBlockchainService } from "src/ethereum/providers/ethereum-blockchain.service"
import { TokensRepository } from "src/tokens/providers/tokens.repository"
import { GetPublicTokenDto } from "src/tokens/dto/get-token.dto"
import { Token } from "src/tokens/token.entity"
import { TonBlockchainService } from "src/ton/providers/ton-blockchain.service"
import { GetPublicWalletDto } from "src/wallets/dto/get-wallet.dto"
import { WalletType } from "src/wallets/enums/wallet-type.enum"
import { WalletsRepository } from "src/wallets/providers/wallets.repository"
import { Wallet } from "src/wallets/wallet.entity"
import {
	CONFIRM_ETH_TRANSFER_JOB,
	CONFIRM_TON_TRANSFER_JOB,
	ETH_SOURCE_SWAPS_QUEUE,
	ETH_TOTAL_CONFIRMATIONS,
	MAX_PENDING_SWAP_COUNT_BY_IP,
	TON_SOURCE_SWAPS_QUEUE,
	TON_TOTAL_CONFIRMATIONS,
} from "../constants"
import { ConfirmTransferDto } from "../dto/confirm-transfer.dto"
import { CreateSwapDto } from "../dto/create-swap.dto"
import { GetPublicSwapDto, GetSwapDto } from "../dto/get-swap.dto"
import { SwapStatus } from "../enums/swap-status.enum"
import { SwapEvent } from "../interfaces/swap-event.interface"
import { SwapsHelper } from "../providers/swaps.helper"
import { SwapsRepository } from "../providers/swaps.repository"
import { Swap } from "../swap.entity"

@Controller("swaps")
export class SwapsController {
	private readonly logger = new Logger(SwapsController.name)

	constructor(
		@InjectQueue(ETH_SOURCE_SWAPS_QUEUE) private readonly ethSourceSwapsQueue: Queue,
		@InjectQueue(TON_SOURCE_SWAPS_QUEUE) private readonly tonSourceSwapsQueue: Queue,
		private readonly swapsRepository: SwapsRepository,
		private readonly tokensRepository: TokensRepository,
		private readonly walletsRepository: WalletsRepository,
		private readonly ethereumBlockchainService: EthereumBlockchainService,
		private readonly tonBlockchainService: TonBlockchainService,
		private readonly eventsService: EventsService,
		private readonly swapsHelper: SwapsHelper,
	) {}

	@Post()
	@UseInterceptors(TracerInterceptor)
	async createSwap(
		@Body() createSwapDto: CreateSwapDto,
		@Ip() ipAddress: string,
	): Promise<GetPublicSwapDto> {
		const rootSpan = TraceAgent.get().getCurrentRootSpan()
		const createSwapSpan = rootSpan.createChildSpan({ name: "create-swap" })

		const destinationToken = await this.tokensRepository.findById(
			createSwapDto.destinationTokenId,
		)
		if (!destinationToken) {
			throw new NotFoundException(ERROR_TOKEN_NOT_FOUND)
		}

		try {
			switch (destinationToken.blockchain) {
				case Blockchain.Ethereum: {
					createSwapDto.destinationAddress =
						this.ethereumBlockchainService.normalizeAddress(
							createSwapDto.destinationAddress,
						)
					break
				}
				case Blockchain.TON: {
					createSwapDto.destinationAddress = this.tonBlockchainService.normalizeAddress(
						createSwapDto.destinationAddress,
					)
					break
				}
			}
		} catch (err: unknown) {
			throw new BadRequestException(ERROR_INVALID_ADDRESS)
		}

		const sourceToken = await this.tokensRepository.findById(createSwapDto.sourceTokenId)
		if (!sourceToken) {
			throw new NotFoundException(ERROR_TOKEN_NOT_FOUND)
		}

		if (new BigNumber(createSwapDto.sourceAmount).lt(sourceToken.minSwapAmount)) {
			throw new BadRequestException(ERROR_SWAP_AMOUNT_TOO_LOW)
		}
		if (new BigNumber(createSwapDto.sourceAmount).gt(sourceToken.maxSwapAmount)) {
			throw new BadRequestException(ERROR_SWAP_AMOUNT_TOO_HIGH)
		}

		const pendingSwapCount = await this.swapsRepository.count({
			ipAddress,
			status: SwapStatus.Pending,
		})
		if (pendingSwapCount > MAX_PENDING_SWAP_COUNT_BY_IP) {
			this.logger.warn(`${ERROR_TOO_MANY_REQUESTS} from ${ipAddress}`)
			throw new UnprocessableEntityException(ERROR_TOO_MANY_REQUESTS)
		}

		const [destinationAmount, fee] = this.swapsHelper.calculateDestinationAmountAndFee(
			new BigNumber(createSwapDto.sourceAmount),
		)

		let destinationWallet: Wallet = null
		if (destinationToken.blockchain !== Blockchain.TON) {
			destinationWallet = await this.walletsRepository.findBestMatchedOne({
				blockchain: destinationToken.blockchain,
				type: WalletType.Transferer,
				minBalance: destinationAmount,
			})
			if (!destinationWallet) {
				this.logger.error(
					`${ERROR_DESTINATION_WALLLET_NOT_AVAILABLE} in ${destinationToken.blockchain}`,
					undefined,
				)
				throw new NotFoundException(ERROR_DESTINATION_WALLLET_NOT_AVAILABLE)
			}
		}

		const collectorWallet = await this.walletsRepository.findBestMatchedOne({
			blockchain: sourceToken.blockchain,
			type: WalletType.Collector,
		})
		if (!collectorWallet) {
			this.logger.error(
				`${ERROR_COLLECTOR_WALLLET_NOT_AVAILABLE} in ${sourceToken.blockchain}`,
				undefined,
			)
			throw new NotFoundException(ERROR_COLLECTOR_WALLLET_NOT_AVAILABLE)
		}

		const sourceWallet = await this.walletsRepository.findBestMatchedOne({
			blockchain: sourceToken.blockchain,
			type: WalletType.Transferer,
			inUse: false,
		})
		if (!sourceWallet) {
			this.logger.error(
				`${ERROR_SOURCE_WALLLET_NOT_AVAILABLE} in ${sourceToken.blockchain}`,
				undefined,
			)
			throw new NotFoundException(ERROR_SOURCE_WALLLET_NOT_AVAILABLE)
		}

		await this.walletsRepository.update(sourceWallet.id, { inUse: true })

		let swap: Swap = null
		try {
			swap = await this.swapsRepository.create({
				sourceAmount: new Quantity(createSwapDto.sourceAmount, sourceToken.decimals),
				sourceToken,
				sourceWallet,
				destinationAddress: createSwapDto.destinationAddress,
				destinationAmount: new Quantity(destinationAmount, destinationToken.decimals),
				destinationToken,
				destinationWallet,
				fee: new Quantity(fee, sourceToken.decimals),
				collectorWallet,
				ipAddress,
				orderedAt: new Date(createSwapDto.orderedAt),
			})
		} catch (err: unknown) {
			await this.walletsRepository.update(sourceWallet.id, { inUse: false })
			throw err
		}

		this.logger.log(`${swap.id}: Swap created`)
		createSwapSpan.endSpan()

		const runConfirmSwapJobSpan = rootSpan.createChildSpan({ name: "run-confirm-swap-job" })
		try {
			switch (sourceToken.blockchain) {
				case Blockchain.Ethereum: {
					await this.runConfirmEthSwapJob(swap.id)
					break
				}
				case Blockchain.TON: {
					await this.runConfirmTonSwapJob(swap.id)
					break
				}
				default: {
					this.logger.error(
						`${ERROR_BLOCKCHAIN_NOT_SUPPORTED}: ${sourceToken.blockchain}`,
						undefined,
					)
					throw new UnprocessableEntityException(ERROR_BLOCKCHAIN_NOT_SUPPORTED)
				}
			}
		} catch (err: any) {
			await this.swapsRepository.update(swap.id, {
				status: SwapStatus.Failed,
				statusCode: getStatusCode(err.message),
			})

			await this.walletsRepository.update(sourceWallet.id, { inUse: false })
			throw err
		}

		const swapDto = this.toGetPublicSwapDto(swap)
		runConfirmSwapJobSpan.endSpan()
		return swapDto
	}

	@Delete(":id")
	@HttpCode(HttpStatus.NO_CONTENT)
	async cancelSwap(@Param("id", new ParseUUIDPipe({ version: "4" })) id: string): Promise<void> {
		const swap = await this.swapsRepository.findById(id)
		if (!swap) {
			throw new NotFoundException(ERROR_SWAP_NOT_FOUND)
		}

		if (swap.status === SwapStatus.Completed) {
			throw new ConflictException(ERROR_SWAP_ALREADY_COMPLETED)
		}

		if (swap.status !== SwapStatus.Pending) {
			throw new ConflictException(ERROR_SWAP_IN_PROGRESS)
		}

		await this.swapsRepository.update(swap.id, { status: SwapStatus.Canceled })
	}

	@Sse("events")
	subscribeToSwapEvents(
		@Query("swapId", new ParseUUIDPipe({ version: "4" })) swapId: string,
	): Observable<Event> {
		return this.eventsService.subscribe(swapId)
	}

	@UseGuards(JwtAuthGuard)
	@Get(":shortId/search")
	async searchSwaps(@Param("shortId") shortId: string): Promise<GetSwapDto[]> {
		const swaps = await this.swapsRepository.findByShortId(shortId)
		return swaps.map((swap) => this.toGetSwapDto(swap))
	}

	@Get(":id")
	async getSwap(
		@Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
	): Promise<GetPublicSwapDto> {
		const swap = await this.swapsRepository.findById(id)
		if (!swap) {
			throw new NotFoundException(ERROR_SWAP_NOT_FOUND)
		}

		return this.toGetPublicSwapDto(swap)
	}

	private async runConfirmEthSwapJob(swapId: string): Promise<void> {
		try {
			const block = await this.ethereumBlockchainService.getLatestBlock()

			await this.ethSourceSwapsQueue.add(
				CONFIRM_ETH_TRANSFER_JOB,
				{
					swapId,
					blockNumber: block.number,
				} as ConfirmTransferDto,
				{
					lifo: true,
					priority: QUEUE_HIGH_PRIORITY,
				},
			)

			this.eventsService.emit({
				id: swapId,
				status: SwapStatus.Pending,
				currentConfirmations: 0,
				totalConfirmations: ETH_TOTAL_CONFIRMATIONS,
			} as SwapEvent)
		} catch (err: any) {
			this.logger.error(
				`${swapId}: ${ERROR_BLOCKCHAIN_CONNECTION_LOST}: ${err?.message}`,
				err?.stack,
			)
			throw new UnprocessableEntityException(ERROR_BLOCKCHAIN_CONNECTION_LOST)
		}
	}

	private async runConfirmTonSwapJob(swapId: string): Promise<void> {
		try {
			const block = await this.tonBlockchainService.getLatestBlock()

			await this.tonSourceSwapsQueue.add(
				CONFIRM_TON_TRANSFER_JOB,
				{
					swapId,
					blockNumber: block.number,
				} as ConfirmTransferDto,
				{
					lifo: true,
					priority: QUEUE_HIGH_PRIORITY,
				},
			)

			this.eventsService.emit({
				id: swapId,
				status: SwapStatus.Pending,
				currentConfirmations: 0,
				totalConfirmations: TON_TOTAL_CONFIRMATIONS,
			} as SwapEvent)
		} catch (err: any) {
			this.logger.error(
				`${swapId}: ${ERROR_BLOCKCHAIN_CONNECTION_LOST}: ${err?.message}`,
				err?.stack,
			)
			throw new UnprocessableEntityException(ERROR_BLOCKCHAIN_CONNECTION_LOST)
		}
	}

	private toGetPublicSwapDto(swap: Swap): GetPublicSwapDto {
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
			wallet: this.toGetPublicWalletDto(swap.sourceWallet),
			status: swap.status,
			statusCode: swap.statusCode,
			currentConfirmations: swap.confirmations,
			totalConfirmations:
				swap.sourceToken.blockchain === Blockchain.TON
					? TON_TOTAL_CONFIRMATIONS
					: ETH_TOTAL_CONFIRMATIONS,
			orderedAt: swap.orderedAt.getTime(),
			createdAt: swap.createdAt.getTime(),
			updatedAt: swap.updatedAt.getTime(),
			expiresAt: swap.expiresAt.getTime(),
		}
	}

	private toGetSwapDto(swap: Swap): GetSwapDto {
		return {
			id: swap.id,
			sourceAddress: swap.sourceAddress,
			sourceAmount: swap.sourceAmount,
			sourceToken: this.toGetPublicTokenDto(swap.sourceToken),
			sourceWalet: this.toGetPublicWalletDto(swap.sourceWallet),
			sourceTransactionId: swap.sourceTransactionId,
			destinationAddress: swap.destinationAddress,
			destinationConjugatedAddress: swap.destinationConjugatedAddress,
			destinationAmount: swap.destinationAmount,
			destinationToken: this.toGetPublicTokenDto(swap.destinationToken),
			destinationWallet: this.toGetPublicWalletDto(swap.destinationWallet),
			destinationTransactionId: swap.destinationTransactionId,
			status: swap.status,
			statusCode: swap.statusCode,
			currentConfirmations: swap.confirmations,
			totalConfirmations:
				swap.sourceToken.blockchain === Blockchain.TON
					? TON_TOTAL_CONFIRMATIONS
					: ETH_TOTAL_CONFIRMATIONS,
			orderedAt: swap.orderedAt.toISOString(),
			createdAt: swap.createdAt.toISOString(),
			updatedAt: swap.updatedAt.toISOString(),
			expiresAt: swap.expiresAt.toISOString(),
		}
	}

	private toGetPublicWalletDto(wallet: Wallet): GetPublicWalletDto | null {
		return (
			wallet && {
				id: wallet.id,
				address: wallet.address,
				conjugatedAddress: wallet.conjugatedAddress,
			}
		)
	}

	private toGetPublicTokenDto(token: Token): GetPublicTokenDto {
		return {
			id: token.id,
			blockchain: token.blockchain,
			name: token.name,
			symbol: token.symbol,
			decimals: token.decimals,
			address: token.address,
			conjugatedAddress: token.conjugatedAddress,
			minSwapAmount: token.minSwapAmount,
			maxSwapAmount: token.maxSwapAmount,
		}
	}
}
