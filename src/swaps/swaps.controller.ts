import { InjectQueue } from "@nestjs/bull"
import {
	Body,
	Controller,
	Delete,
	Get,
	HttpCode,
	HttpStatus,
	Logger,
	Param,
	Post,
	Query,
	Sse,
} from "@nestjs/common"
import BigNumber from "bignumber.js"
import { Queue } from "bull"
import { Observable } from "rxjs"
import {
	ERROR_BLOCKCHAIN_CONNECTION_LOST,
	ERROR_BLOCKCHAIN_NOT_SUPPORTED,
	ERROR_COLLECTOR_WALLLET_NOT_AVAILABLE,
	ERROR_DESTINATION_WALLLET_NOT_AVAILABLE,
	ERROR_INVALID_ADDRESS_FORMAT,
	ERROR_SOURCE_WALLLET_NOT_AVAILABLE,
	ERROR_SWAP_ALREADY_COMPLETED,
	ERROR_SWAP_AMOUNT_TOO_HIGH,
	ERROR_SWAP_AMOUNT_TOO_LOW,
	ERROR_SWAP_IN_PROGRESS,
	ERROR_SWAP_NOT_FOUND,
	ERROR_TOKEN_NOT_FOUND,
	ERROR_TOO_MANY_REQUESTS,
	ERROR_TO_STATUS_CODE,
	QUEUE_HIGH_PRIORITY,
} from "src/common/constants"
import { Blockchain } from "src/common/enums/blockchain.enum"
import { BadRequestException } from "src/common/exceptions/bad-request.exception"
import { ConflictException } from "src/common/exceptions/conflict.exception"
import { NotFoundException } from "src/common/exceptions/not-found.exception"
import { TooManyRequestsExcetion } from "src/common/exceptions/too-many-requests.exception"
import { UnprocessableEntityException } from "src//common/exceptions/unprocessable-entity.exception"
import { EventsService } from "src/common/providers/events.service"
import { EthereumBlockchainService } from "src/ethereum/providers/ethereum-blockchain.service"
import { TokensRepository } from "src/tokens/providers/tokens.repository"
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
} from "./constants"
import { IpAddress } from "../common/decorators/ip-address"
import { ConfirmTransferDto } from "./dto/confirm-transfer.dto"
import { CreateSwapDto } from "./dto/create-swap.dto"
import { GetSwapDto } from "./dto/get-swap.dto"
import { SwapStatus } from "./enums/swap-status.enum"
import { SwapsHelper } from "./providers/swaps.helper"
import { SwapsRepository } from "./providers/swaps.repository"
import { Swap } from "./swap.entity"

@Controller("swaps")
export class SwapsController {
	private readonly logger = new Logger(SwapsController.name)

	constructor(
		@InjectQueue(ETH_SOURCE_SWAPS_QUEUE) private readonly ethSourceSwapsQueue: Queue,
		@InjectQueue(TON_SOURCE_SWAPS_QUEUE) private readonly tonSourceSwapsQueue: Queue,
		private readonly ethereumBlockchain: EthereumBlockchainService,
		private readonly tonBlockchain: TonBlockchainService,
		private readonly swapsHelper: SwapsHelper,
		private readonly swapsRepository: SwapsRepository,
		private readonly eventsService: EventsService,
		private readonly tokensRepository: TokensRepository,
		private readonly walletsRepository: WalletsRepository,
	) {}

	@Post()
	async createSwap(
		@Body() createSwapDto: CreateSwapDto,
		@IpAddress() ipAddress: string,
	): Promise<GetSwapDto> {
		const destinationToken = await this.tokensRepository.findById(
			createSwapDto.destinationTokenId,
		)
		if (!destinationToken) {
			throw new NotFoundException(ERROR_TOKEN_NOT_FOUND)
		}

		try {
			createSwapDto.destinationAddress =
				destinationToken.blockchain === Blockchain.Ethereum
					? this.ethereumBlockchain.normalizeAddress(createSwapDto.destinationAddress)
					: this.tonBlockchain.normalizeAddress(createSwapDto.destinationAddress)
		} catch (err: unknown) {
			throw new BadRequestException(ERROR_INVALID_ADDRESS_FORMAT)
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

		const pendingSwapCount = await this.swapsRepository.count(ipAddress, SwapStatus.Pending)
		if (pendingSwapCount > MAX_PENDING_SWAP_COUNT_BY_IP) {
			this.logger.warn(`${ERROR_TOO_MANY_REQUESTS} from ${ipAddress}`)
			throw new TooManyRequestsExcetion(ERROR_TOO_MANY_REQUESTS)
		}

		const [destinationAmount, fee] = this.swapsHelper.calculateDestinationAmountAndFee(
			new BigNumber(createSwapDto.sourceAmount),
		)

		let destinationWallet: Wallet
		if (destinationToken.blockchain !== Blockchain.TON) {
			destinationWallet = await this.walletsRepository.findRandomOne(
				destinationToken.blockchain,
				WalletType.Transfer,
				destinationAmount.toFixed(destinationToken.decimals),
			)
			if (!destinationWallet) {
				this.logger.error(
					`${ERROR_DESTINATION_WALLLET_NOT_AVAILABLE} in ${destinationToken.blockchain}`,
				)
				throw new NotFoundException(ERROR_DESTINATION_WALLLET_NOT_AVAILABLE)
			}
		}

		const collectorWallet = await this.walletsRepository.findRandomOne(
			sourceToken.blockchain,
			WalletType.Collector,
		)
		if (!collectorWallet) {
			this.logger.error(
				`${ERROR_COLLECTOR_WALLLET_NOT_AVAILABLE} in ${sourceToken.blockchain}`,
			)
			throw new NotFoundException(ERROR_COLLECTOR_WALLLET_NOT_AVAILABLE)
		}

		const sourceWallet = await this.walletsRepository.findRandomOne(
			sourceToken.blockchain,
			WalletType.Transfer,
			undefined,
			false,
		)
		if (!sourceWallet) {
			this.logger.error(`${ERROR_SOURCE_WALLLET_NOT_AVAILABLE} in ${sourceToken.blockchain}`)
			throw new NotFoundException(ERROR_SOURCE_WALLLET_NOT_AVAILABLE)
		}

		await this.walletsRepository.update(sourceWallet.id, { inUse: true })

		const swap = await this.swapsRepository.create(
			createSwapDto,
			destinationAmount.toString(),
			fee.toString(),
			sourceToken,
			destinationToken,
			sourceWallet,
			destinationWallet,
			collectorWallet,
			ipAddress,
		)

		try {
			switch (sourceToken.blockchain) {
				case Blockchain.Ethereum:
					await this.runConfirmEthSwapJob(swap.id)
					break
				case Blockchain.TON:
					await this.runConfirmTonSwapJob(swap.id)
					break
				default:
					this.logger.error(
						`${ERROR_BLOCKCHAIN_NOT_SUPPORTED}: ${sourceToken.blockchain}`,
					)
					throw new UnprocessableEntityException(ERROR_BLOCKCHAIN_NOT_SUPPORTED)
			}
		} catch (err: any) {
			await this.swapsRepository.update(swap.id, {
				status: SwapStatus.Failed,
				statusCode: ERROR_TO_STATUS_CODE[err.message],
			})
			throw err
		}

		return this.toGetSwapDto(swap)
	}

	@Delete(":id")
	@HttpCode(HttpStatus.NO_CONTENT)
	async cancelSwap(@Param("id") id: string): Promise<void> {
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

	@Get(":id")
	async getSwap(@Param("id") id: string): Promise<GetSwapDto> {
		const swap = await this.swapsRepository.findById(id)
		if (!swap) {
			throw new NotFoundException(ERROR_SWAP_NOT_FOUND)
		}

		return this.toGetSwapDto(swap)
	}

	@Sse("events")
	swapEvents(@Query("swapId") swapId: string): Observable<any> {
		return this.eventsService.subscribe(swapId)
	}

	private async runConfirmEthSwapJob(swapId: string): Promise<void> {
		try {
			const block = await this.ethereumBlockchain.getLatestBlock()

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
		} catch (err: unknown) {
			this.logger.warn(
				`${swapId}: ${ERROR_BLOCKCHAIN_CONNECTION_LOST}: ${Blockchain.Ethereum}`,
			)
			throw new UnprocessableEntityException(ERROR_BLOCKCHAIN_CONNECTION_LOST)
		}
	}

	private async runConfirmTonSwapJob(swapId: string): Promise<void> {
		try {
			const block = await this.tonBlockchain.getLatestBlock()

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
		} catch (err: unknown) {
			this.logger.warn(`${swapId}: ${ERROR_BLOCKCHAIN_CONNECTION_LOST}: ${Blockchain.TON}`)
			throw new UnprocessableEntityException(ERROR_BLOCKCHAIN_CONNECTION_LOST)
		}
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

	private toGetPublicWalletDto(wallet: Wallet): GetPublicWalletDto {
		return {
			id: wallet.id,
			address: wallet.address,
			conjugatedAddress: wallet.conjugatedAddress,
		}
	}
}
