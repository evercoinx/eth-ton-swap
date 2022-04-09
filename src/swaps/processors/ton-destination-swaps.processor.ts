import { InjectQueue, OnQueueCompleted, OnQueueFailed, Process, Processor } from "@nestjs/bull"
import { CACHE_MANAGER, Inject, Logger } from "@nestjs/common"
import BigNumber from "bignumber.js"
import { Job, Queue } from "bull"
import { Cache } from "cache-manager"
import { EventsService } from "src/common/events.service"
import { Blockchain } from "src/tokens/token.entity"
import { TonBlockchainProvider } from "src/ton/ton-blockchain.provider"
import { TonContractProvider } from "src/ton/ton-contract.provider"
import { WalletType } from "src/wallets/wallet.entity"
import { WalletsService } from "src/wallets/wallets.service"
import {
	ETH_SOURCE_SWAPS_QUEUE,
	QUEUE_HIGH_PRIORITY,
	QUEUE_LOW_PRIORITY,
	QUEUE_MEDIUM_PRIORITY,
	SET_TON_TRANSACTION_DATA,
	TONCOIN_MINT_AMOUNT,
	TON_BLOCK_TRACKING_INTERVAL,
	TON_DESTINATION_SWAPS_QUEUE,
	TOTAL_CONFIRMATIONS,
	TRANSFER_ETH_FEE_JOB,
	TRANSFER_TON_SWAP_JOB,
} from "../constants"
import { SetTransactionDataDto } from "../dto/set-transaction-data.dto"
import { TransferFeeDto } from "../dto/transfer-fee.dto"
import { TransferSwapDto } from "../dto/transfer-swap.dto"
import { SwapStatus } from "../swap.entity"
import { SwapsService } from "../swaps.service"
import { TonBaseSwapsProcessor } from "./ton-base-swaps.processor"

@Processor(TON_DESTINATION_SWAPS_QUEUE)
export class TonDestinationSwapsProcessor extends TonBaseSwapsProcessor {
	private readonly logger = new Logger(TonDestinationSwapsProcessor.name)

	constructor(
		@Inject(CACHE_MANAGER) cacheManager: Cache,
		tonBlockchain: TonBlockchainProvider,
		tonContract: TonContractProvider,
		swapsService: SwapsService,
		eventsService: EventsService,
		private readonly walletsService: WalletsService,
		@InjectQueue(TON_DESTINATION_SWAPS_QUEUE) private readonly destinationSwapsQueue: Queue,
		@InjectQueue(ETH_SOURCE_SWAPS_QUEUE) private readonly sourceSwapsQueue: Queue,
	) {
		super(cacheManager, "ton:dst", tonBlockchain, tonContract, swapsService, eventsService)
	}

	@Process(TRANSFER_TON_SWAP_JOB)
	async transferTonSwap(job: Job<TransferSwapDto>): Promise<SwapStatus> {
		const { data } = job
		this.logger.debug(`${data.swapId}: Start transferring swap`)

		const swap = await this.swapsService.findById(data.swapId)
		if (!swap) {
			this.logger.error(`${data.swapId}: Swap not found`)
			return SwapStatus.Failed
		}

		if (swap.expiresAt < new Date()) {
			await this.swapsService.update(
				{
					id: swap.id,
					status: SwapStatus.Expired,
				},
				swap.sourceToken,
				swap.destinationToken,
			)

			this.logger.error(`${swap.id}: Swap expired`)
			return SwapStatus.Expired
		}

		const adminWallet = await this.walletsService.findRandom(Blockchain.TON, WalletType.Minter)
		if (!adminWallet) {
			this.logger.error(`${data.swapId}: Admin wallet of jetton minter not found`)
			return SwapStatus.Failed
		}

		const adminWalletSigner = this.tonContract.createWalletSigner(adminWallet.secretKey)
		await this.tonContract.mintJettons(
			adminWalletSigner,
			swap.destinationAddress,
			new BigNumber(swap.destinationAmount),
			new BigNumber(0.1),
			TONCOIN_MINT_AMOUNT,
			false,
		)

		return SwapStatus.Confirmed
	}

	@OnQueueFailed({ name: TRANSFER_TON_SWAP_JOB })
	async onTransferTonSwapFailed(job: Job<TransferSwapDto>, err: Error): Promise<void> {
		const { data } = job
		this.logger.debug(`${data.swapId}: ${err.message}: Retrying...`)

		await this.destinationSwapsQueue.add(
			TRANSFER_TON_SWAP_JOB,
			{
				swapId: data.swapId,
			} as TransferSwapDto,
			{
				delay: TON_BLOCK_TRACKING_INTERVAL,
				priority: QUEUE_HIGH_PRIORITY,
			},
		)
	}

	@OnQueueCompleted({ name: TRANSFER_TON_SWAP_JOB })
	async onTransferTonSwapCompleted(
		job: Job<TransferSwapDto>,
		resultStatus: SwapStatus,
	): Promise<void> {
		const { data } = job
		if (!this.isSwapProcessable(resultStatus)) {
			this.emitEvent(data.swapId, resultStatus, 0)
			return
		}

		this.logger.log(`${data.swapId}: Swap transferred`)

		await this.destinationSwapsQueue.add(
			SET_TON_TRANSACTION_DATA,
			{
				swapId: data.swapId,
			} as SetTransactionDataDto,
			{
				delay: TON_BLOCK_TRACKING_INTERVAL,
				priority: QUEUE_HIGH_PRIORITY,
			},
		)
	}

	@Process(SET_TON_TRANSACTION_DATA)
	async setTonTransactionData(job: Job<SetTransactionDataDto>): Promise<SwapStatus> {
		const { data } = job
		this.logger.debug(`${data.swapId}: Start setting transaction data`)

		const swap = await this.swapsService.findById(data.swapId)
		if (!swap) {
			this.logger.error(`${data.swapId}: Swap not found`)
			return SwapStatus.Failed
		}

		if (swap.expiresAt < new Date()) {
			await this.swapsService.update(
				{
					id: swap.id,
					status: SwapStatus.Expired,
				},
				swap.sourceToken,
				swap.destinationToken,
			)

			this.logger.error(`${swap.id}: Swap expired`)
			return SwapStatus.Expired
		}

		const adminWallet = await this.walletsService.findRandom(Blockchain.TON, WalletType.Minter)
		if (!adminWallet) {
			this.logger.error(`${data.swapId}: Admin wallet of jetton minter not found`)
			return SwapStatus.Failed
		}

		const adminWalletSigner = this.tonContract.createVoidWalletSigner(adminWallet.address)
		const jettonWalletAddress = await this.tonContract.getJettonWalletAddress(
			adminWalletSigner,
			swap.destinationAddress,
		)

		const transaction = await this.tonBlockchain.findTransaction(
			jettonWalletAddress,
			TONCOIN_MINT_AMOUNT,
			swap.createdAt.getTime(),
			true,
		)

		await this.swapsService.update(
			{
				id: swap.id,
				destinationTransactionId: transaction.id,
				status: SwapStatus.Completed,
			},
			swap.sourceToken,
			swap.destinationToken,
		)

		return SwapStatus.Completed
	}

	@OnQueueFailed({ name: SET_TON_TRANSACTION_DATA })
	async onSetTonTransactionDataFailed(
		job: Job<SetTransactionDataDto>,
		err: Error,
	): Promise<void> {
		const { data } = job
		this.logger.debug(`${data.swapId}: ${err.message}: Retrying...`)

		await this.destinationSwapsQueue.add(
			SET_TON_TRANSACTION_DATA,
			{
				swapId: data.swapId,
			} as SetTransactionDataDto,
			{
				delay: TON_BLOCK_TRACKING_INTERVAL,
				priority: QUEUE_MEDIUM_PRIORITY,
			},
		)
	}

	@OnQueueCompleted({ name: SET_TON_TRANSACTION_DATA })
	async onSetTonTransactionDataCompleted(
		job: Job<TransferSwapDto>,
		resultStatus: SwapStatus,
	): Promise<void> {
		const { data } = job
		if (!this.isSwapProcessable(resultStatus)) {
			this.emitEvent(data.swapId, resultStatus, 0)
			return
		}

		this.emitEvent(data.swapId, SwapStatus.Completed, TOTAL_CONFIRMATIONS)
		this.logger.log(`${data.swapId}: Set transaction data`)

		await this.sourceSwapsQueue.add(
			TRANSFER_ETH_FEE_JOB,
			{
				swapId: data.swapId,
			} as TransferFeeDto,
			{
				priority: QUEUE_LOW_PRIORITY,
			},
		)
	}
}
