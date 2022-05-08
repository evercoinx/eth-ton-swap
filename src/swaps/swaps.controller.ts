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
	Sse,
	UnprocessableEntityException,
} from "@nestjs/common"
import BigNumber from "bignumber.js"
import { Queue } from "bull"
import { Observable } from "rxjs"
import { QUEUE_HIGH_PRIORITY } from "src/common/constants"
import { Blockchain } from "src/common/enums/blockchain.enum"
import { EventsService } from "src/common/events.service"
import { capitalize } from "src/common/utils"
import { TokensRepository } from "src/tokens/providers/tokens.repository"
import { EthereumBlockchainService } from "src/ethereum/providers/ethereum-blockchain.service"
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
			throw new NotFoundException("Destination token is not found")
		}

		try {
			createSwapDto.destinationAddress =
				destinationToken.blockchain === Blockchain.Ethereum
					? this.ethereumBlockchain.normalizeAddress(createSwapDto.destinationAddress)
					: this.tonBlockchain.normalizeAddress(createSwapDto.destinationAddress)
		} catch (err: unknown) {
			throw new BadRequestException("Invalid destination address is specified")
		}

		const sourceToken = await this.tokensRepository.findById(createSwapDto.sourceTokenId)
		if (!sourceToken) {
			throw new NotFoundException("Source token is not found")
		}

		if (new BigNumber(createSwapDto.sourceAmount).lt(sourceToken.minSwapAmount)) {
			throw new BadRequestException(
				`${createSwapDto.sourceAmount} is below the minimum allowed swap amount`,
			)
		}
		if (new BigNumber(createSwapDto.sourceAmount).gt(sourceToken.maxSwapAmount)) {
			throw new BadRequestException(
				`${createSwapDto.sourceAmount} is above the maximum allowed swap amount`,
			)
		}

		const pendingSwapCount = await this.swapsRepository.count(ipAddress, SwapStatus.Pending)
		if (pendingSwapCount > MAX_PENDING_SWAP_COUNT_BY_IP) {
			this.logger.warn(`Too many pending swaps from IP: ${ipAddress}`)
			throw new ConflictException("There are too many pending swaps from your IP address")
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
					`Destination ${WalletType.Transfer} wallet in ${destinationToken.blockchain} not available`,
				)
				throw new NotFoundException(
					`Destination wallet in ${destinationToken.blockchain} is not available`,
				)
			}
		}

		const collectorWallet = await this.walletsRepository.findRandomOne(
			sourceToken.blockchain,
			WalletType.Collector,
		)
		if (!collectorWallet) {
			this.logger.error(
				`${capitalize(WalletType.Collector)} wallet in ${
					sourceToken.blockchain
				} not available`,
			)
			throw new NotFoundException(
				`${capitalize(WalletType.Collector)} wallet in ${
					sourceToken.blockchain
				} is not available`,
			)
		}

		const sourceWallet = await this.walletsRepository.findRandomOne(
			sourceToken.blockchain,
			WalletType.Transfer,
			undefined,
			false,
		)
		if (!sourceWallet) {
			this.logger.error(
				`Source ${WalletType.Transfer} wallet in ${sourceToken.blockchain} not available`,
			)
			throw new NotFoundException(
				`Source wallet in ${sourceToken.blockchain} is not available`,
			)
		}

		await this.walletsRepository.update(sourceWallet.id, {
			inUse: true,
		})

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
			await this.swapsRepository.update(swap.id, { status: SwapStatus.Failed })
			throw err
		}

		return this.toGetSwapDto(swap)
	}

	@Delete(":id")
	@HttpCode(HttpStatus.NO_CONTENT)
	async cancelSwap(@Param("id") id: string): Promise<void> {
		const swap = await this.swapsRepository.findById(id)
		if (!swap) {
			throw new NotFoundException("Swap is not found")
		}

		if (swap.status === SwapStatus.Completed) {
			throw new ConflictException("Swap has been already completed")
		}

		if (swap.status !== SwapStatus.Pending) {
			throw new ConflictException("Swap is being processed now")
		}

		await this.swapsRepository.update(swap.id, { status: SwapStatus.Canceled })
	}

	@Get(":id")
	async getSwap(@Param("id") id: string): Promise<GetSwapDto> {
		const swap = await this.swapsRepository.findById(id)
		if (!swap) {
			throw new NotFoundException("Swap is not found")
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
			this.logger.error(
				`${swapId}: Latest block in ${Blockchain.Ethereum} not fetched: ${err}`,
			)
			throw new UnprocessableEntityException(
				`We are unable to fetch the latest block in ${Blockchain.Ethereum}`,
			)
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
			this.logger.error(`${swapId}: Latest block in ${Blockchain.TON} not fetched: ${err}`)
			throw new UnprocessableEntityException(
				`We are unable to fetch the latest block in ${Blockchain.TON}`,
			)
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
			wallet: this.toGetPublicWalletDto(swap.sourceWallet),
			status: swap.status,
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
