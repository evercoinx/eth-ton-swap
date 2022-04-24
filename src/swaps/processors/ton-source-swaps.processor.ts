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
	CONFIRM_TON_BLOCK_JOB,
	CONFIRM_TON_SWAP_JOB,
	ETH_DESTINATION_SWAPS_QUEUE,
	QUEUE_HIGH_PRIORITY,
	QUEUE_LOW_PRIORITY,
	SET_TON_TRANSACTION_DATA,
	TON_BLOCK_TRACKING_INTERVAL,
	TON_SOURCE_SWAPS_QUEUE,
	TOTAL_CONFIRMATIONS,
	TRANSFER_ETH_SWAP_JOB,
	TRANSFER_TON_FEE_JOB,
} from "../constants"
import { ConfirmBlockDto } from "../dto/confirm-block.dto"
import { ConfirmSwapDto } from "../dto/confirm-swap.dto"
import { SetTransactionDataDto } from "../dto/set-transaction-data.dto"
import { TransferFeeDto } from "../dto/transfer-fee.dto"
import { TransferSwapDto } from "../dto/transfer-swap.dto"
import { SwapStatus } from "../swap.entity"
import { SwapsService } from "../swaps.service"
import { TonBaseSwapsProcessor } from "./ton-base-swaps.processor"

@Processor(TON_SOURCE_SWAPS_QUEUE)
export class TonSourceSwapsProcessor extends TonBaseSwapsProcessor {
	private readonly logger = new Logger(TonSourceSwapsProcessor.name)

	constructor(
		@Inject(CACHE_MANAGER) cacheManager: Cache,
		protected readonly tonBlockchain: TonBlockchainProvider,
		protected readonly tonContract: TonContractProvider,
		protected readonly swapsService: SwapsService,
		protected readonly eventsService: EventsService,
		protected readonly walletsService: WalletsService,
		@InjectQueue(TON_SOURCE_SWAPS_QUEUE) private readonly sourceSwapsQueue: Queue,
		@InjectQueue(ETH_DESTINATION_SWAPS_QUEUE) private readonly destinationSwapsQueue: Queue,
	) {
		super(
			cacheManager,
			"ton:src",
			tonBlockchain,
			tonContract,
			swapsService,
			eventsService,
			walletsService,
		)
	}

	@Process(CONFIRM_TON_SWAP_JOB)
	async conifrmTonSwap(job: Job<ConfirmSwapDto>): Promise<SwapStatus> {
		const { data } = job
		this.logger.debug(`${data.swapId}: Start confirming swap by block ${data.blockNumber}`)

		const swap = await this.swapsService.findById(data.swapId)
		if (!swap) {
			this.logger.error(`${data.swapId}: Swap not found`)
			return SwapStatus.Failed
		}

		if (swap.status === SwapStatus.Canceled) {
			await this.walletsService.update(swap.sourceWallet.id, { inUse: false })

			this.logger.warn(`${swap.id}: Swap canceled`)
			return SwapStatus.Canceled
		}

		if (swap.expiresAt < new Date()) {
			await this.swapsService.update(swap.id, { status: SwapStatus.Expired })

			await this.walletsService.update(swap.sourceWallet.id, { inUse: false })

			this.logger.error(`${swap.id}: Swap expired`)
			return SwapStatus.Expired
		}

		if (!swap.sourceWallet.conjugatedAddress) {
			await this.swapsService.update(swap.id, { status: SwapStatus.Failed })

			await this.walletsService.update(swap.sourceWallet.id, { inUse: false })

			this.logger.error(`${swap.id}: Source wallet has no conjugated address`)
			return SwapStatus.Failed
		}

		const inputTransaction = await this.tonBlockchain.findTransaction(
			swap.sourceWallet.conjugatedAddress,
			swap.createdAt.getTime(),
			true,
		)
		if (!inputTransaction.sourceAddress) {
			await this.swapsService.update(swap.id, { status: SwapStatus.Failed })

			await this.walletsService.update(swap.sourceWallet.id, { inUse: false })

			this.logger.error(`${swap.id}: Input transaction is not internal`)
			return SwapStatus.Failed
		}

		const outputTransaction = await this.tonBlockchain.findTransaction(
			inputTransaction.sourceAddress,
			swap.createdAt.getTime(),
			false,
		)

		const jettonWalletData = await this.tonContract.getJettonWalletData(
			inputTransaction.sourceAddress,
		)

		await this.swapsService.update(
			swap.id,
			{
				sourceAddress: this.tonBlockchain.normalizeAddress(jettonWalletData.ownerAddress),
				sourceConjugatedAddress: this.tonBlockchain.normalizeAddress(
					inputTransaction.sourceAddress,
				),
				sourceAmount: swap.sourceAmount,
				sourceTransactionId: outputTransaction.id,
				destinationAmount: swap.destinationAmount,
				fee: swap.fee,
				status: SwapStatus.Confirmed,
			},
			swap.sourceToken.decimals,
			swap.destinationToken.decimals,
		)

		await this.walletsService.update(swap.sourceWallet.id, { inUse: false })

		return SwapStatus.Confirmed
	}

	@OnQueueFailed({ name: CONFIRM_TON_SWAP_JOB })
	async onConfirmTonSwapFailed(job: Job<ConfirmSwapDto>, err: Error): Promise<void> {
		const { data } = job
		this.emitEvent(data.swapId, SwapStatus.Pending, 0)
		this.logger.debug(`${data.swapId}: ${err.message}: Retrying...`)

		await this.sourceSwapsQueue.add(
			CONFIRM_TON_SWAP_JOB,
			{
				swapId: data.swapId,
				blockNumber: data.blockNumber,
			} as ConfirmSwapDto,
			{
				delay: TON_BLOCK_TRACKING_INTERVAL,
				priority: QUEUE_HIGH_PRIORITY,
			},
		)
	}

	@OnQueueCompleted({ name: CONFIRM_TON_SWAP_JOB })
	async onConfirmTonSwapCompleted(
		job: Job<ConfirmSwapDto>,
		resultStatus: SwapStatus,
	): Promise<void> {
		const { data } = job
		if (!this.isSwapProcessable(resultStatus)) {
			this.emitEvent(data.swapId, resultStatus, 0)
			return
		}

		this.emitEvent(data.swapId, SwapStatus.Confirmed, 1)
		this.logger.log(`${data.swapId}: Swap confirmed 1 time by block ${data.blockNumber}`)

		await this.sourceSwapsQueue.add(
			CONFIRM_TON_BLOCK_JOB,
			{
				swapId: data.swapId,
				blockNumber: data.blockNumber + 1,
				confirmations: 2,
			} as ConfirmBlockDto,
			{
				delay: TON_BLOCK_TRACKING_INTERVAL,
				priority: QUEUE_HIGH_PRIORITY,
			},
		)
	}

	@Process(CONFIRM_TON_BLOCK_JOB)
	async confirmTonBlock(job: Job<ConfirmBlockDto>): Promise<SwapStatus> {
		const { data } = job
		this.logger.debug(`${data.swapId}: Start confirming swap by block ${data.blockNumber}`)

		const swap = await this.swapsService.findById(data.swapId)
		if (!swap) {
			this.logger.error(`${data.swapId}: Swap not found`)
			return SwapStatus.Failed
		}

		if (swap.expiresAt < new Date()) {
			await this.swapsService.update(swap.id, { status: SwapStatus.Expired })

			this.logger.error(`${swap.id}: Swap expired`)
			return SwapStatus.Expired
		}

		await this.getBlock(data.blockNumber)

		await this.swapsService.update(swap.id, {
			confirmations: data.confirmations,
			status: SwapStatus.Confirmed,
		})

		return SwapStatus.Confirmed
	}

	@OnQueueFailed({ name: CONFIRM_TON_BLOCK_JOB })
	async onConfirmTonBlockFailed(job: Job<ConfirmBlockDto>, err: Error): Promise<void> {
		const { data } = job
		this.emitEvent(data.swapId, SwapStatus.Confirmed, data.confirmations)
		this.logger.debug(`${data.swapId}: ${err.message}: Retrying...`)

		await this.sourceSwapsQueue.add(
			CONFIRM_TON_BLOCK_JOB,
			{
				swapId: data.swapId,
				blockNumber: data.blockNumber,
				confirmations: data.confirmations,
			} as ConfirmBlockDto,
			{
				delay: TON_BLOCK_TRACKING_INTERVAL,
				priority: QUEUE_HIGH_PRIORITY,
			},
		)
	}

	@OnQueueCompleted({ name: CONFIRM_TON_BLOCK_JOB })
	async onConfirmTonBlockCompleted(
		job: Job<ConfirmBlockDto>,
		resultStatus: SwapStatus,
	): Promise<void> {
		const { data } = job
		if (!this.isSwapProcessable(resultStatus)) {
			this.emitEvent(data.swapId, resultStatus, data.confirmations)
			return
		}

		this.emitEvent(data.swapId, SwapStatus.Confirmed, data.confirmations)
		this.logger.log(
			`${data.swapId}: Swap confirmed ${data.confirmations} times by block ${data.blockNumber}`,
		)

		if (data.confirmations < TOTAL_CONFIRMATIONS) {
			await this.sourceSwapsQueue.add(
				CONFIRM_TON_BLOCK_JOB,
				{
					swapId: data.swapId,
					blockNumber: data.blockNumber + 1,
					confirmations: data.confirmations + 1,
				} as ConfirmBlockDto,
				{
					delay: TON_BLOCK_TRACKING_INTERVAL / 2,
					priority: QUEUE_HIGH_PRIORITY,
				},
			)
			return
		}

		await this.destinationSwapsQueue.add(
			TRANSFER_ETH_SWAP_JOB,
			{ swapId: data.swapId } as TransferSwapDto,
			{ priority: QUEUE_HIGH_PRIORITY },
		)
	}

	@Process(TRANSFER_TON_FEE_JOB)
	async transferTonFee(job: Job<TransferFeeDto>): Promise<void> {
		const { data } = job
		this.logger.debug(`${data.swapId}: Start transferring fee`)

		const swap = await this.swapsService.findById(data.swapId)
		if (!swap) {
			this.logger.error(`${data.swapId}: Swap not found`)
			return
		}

		if (swap.expiresAt < new Date()) {
			this.logger.warn(`${swap.id}: Swap expired`)
			return
		}

		const minterAdminWallet = await this.walletsService.findRandom(
			Blockchain.TON,
			WalletType.Minter,
		)
		if (!minterAdminWallet) {
			this.logger.warn(`${data.swapId}: Admin wallet of jetton minter not found`)
			return
		}

		const walletSigner = this.tonContract.createWalletSigner(swap.sourceWallet.secretKey)
		await this.tonContract.transferJettons(
			walletSigner,
			minterAdminWallet.address,
			swap.collectorWallet.address,
			new BigNumber(swap.fee),
			new BigNumber(0.035),
			undefined,
			swap.id,
		)

		await this.swapsService.update(
			swap.id,
			{ fee: swap.fee },
			swap.sourceToken.decimals,
			swap.destinationToken.decimals,
		)
	}

	@OnQueueFailed({ name: TRANSFER_TON_FEE_JOB })
	async onTransferTonFeeFailed(job: Job<TransferFeeDto>, err: Error): Promise<void> {
		const { data } = job
		this.logger.debug(`${data.swapId}: ${err.message}: Retrying...`)

		await this.sourceSwapsQueue.add(
			TRANSFER_TON_FEE_JOB,
			{ swapId: data.swapId } as TransferFeeDto,
			{
				delay: TON_BLOCK_TRACKING_INTERVAL,
				priority: QUEUE_LOW_PRIORITY,
			},
		)
	}

	@OnQueueCompleted({ name: TRANSFER_TON_FEE_JOB })
	async onTransferTonFeeCompleted(job: Job<TransferFeeDto>): Promise<void> {
		const { data } = job
		this.logger.log(`${data.swapId}: Fee transferred`)

		await this.sourceSwapsQueue.add(
			SET_TON_TRANSACTION_DATA,
			{ swapId: data.swapId } as SetTransactionDataDto,
			{
				delay: TON_BLOCK_TRACKING_INTERVAL,
				priority: QUEUE_LOW_PRIORITY,
			},
		)
	}

	@Process(SET_TON_TRANSACTION_DATA)
	async setTonTransactionData(job: Job<SetTransactionDataDto>): Promise<void> {
		const { data } = job
		this.logger.debug(`${data.swapId}: Start setting transaction data`)

		const swap = await this.swapsService.findById(data.swapId)
		if (!swap) {
			this.logger.error(`${data.swapId}: Swap not found`)
			return
		}

		if (swap.expiresAt < new Date()) {
			this.logger.warn(`${swap.id}: Swap expired`)
			return
		}

		const minterAdminWallet = await this.walletsService.findRandom(
			Blockchain.TON,
			WalletType.Minter,
		)
		if (!minterAdminWallet) {
			this.logger.warn(`${data.swapId}: Admin wallet of jetton minter not found`)
			return
		}

		const conjugatedAddress = await this.tonContract.getJettonWalletAddress(
			minterAdminWallet.address,
			swap.collectorWallet.address,
		)

		const transaction = await this.tonBlockchain.findTransaction(
			conjugatedAddress,
			swap.createdAt.getTime(),
			true,
		)

		await this.swapsService.update(swap.id, { collectorTransactionId: transaction.id })
		this.logger.log(`${data.swapId}: Transaction data set`)
	}

	@OnQueueFailed({ name: SET_TON_TRANSACTION_DATA })
	async onSetTonTransactionDataFailed(
		job: Job<SetTransactionDataDto>,
		err: Error,
	): Promise<void> {
		const { data } = job
		this.logger.debug(`${data.swapId}: ${err.message}: Retrying...`)

		await this.sourceSwapsQueue.add(
			SET_TON_TRANSACTION_DATA,
			{ swapId: data.swapId } as SetTransactionDataDto,
			{
				delay: TON_BLOCK_TRACKING_INTERVAL,
				priority: QUEUE_LOW_PRIORITY,
			},
		)
	}
}
