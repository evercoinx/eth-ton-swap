import { InjectQueue, OnQueueCompleted, OnQueueFailed, Process, Processor } from "@nestjs/bull"
import { CACHE_MANAGER, Inject, Logger } from "@nestjs/common"
import BigNumber from "bignumber.js"
import { Job, Queue } from "bull"
import { Cache } from "cache-manager"
import { QUEUE_HIGH_PRIORITY, QUEUE_LOW_PRIORITY } from "src/common/constants"
import { EventsService } from "src/common/events.service"
import { Blockchain } from "src/tokens/enums/blockchain.enum"
import {
	BURN_JETTON_GAS,
	TON_BLOCK_TRACKING_INTERVAL,
	TRANSFER_JETTON_GAS,
} from "src/ton/constants"
import { JettonTransactionType } from "src/ton/enums/jetton-transaction-type.enum"
import { TonBlockchainProvider } from "src/ton/ton-blockchain.provider"
import { TonContractProvider } from "src/ton/ton-contract.provider"
import { WalletType } from "src/wallets/wallet.entity"
import { WalletsService } from "src/wallets/wallets.service"
import {
	BURN_TON_JETTONS_JOB,
	CONFIRM_TON_BLOCK_JOB,
	CONFIRM_TON_TRANSFER_JOB,
	ETH_DESTINATION_SWAPS_QUEUE,
	GET_TON_FEE_TRANSACTION_JOB,
	TON_SOURCE_SWAPS_QUEUE,
	TOTAL_SWAP_CONFIRMATIONS,
	TRANSFER_ETH_TOKENS_JOB,
	TRANSFER_TON_FEE_JOB,
} from "../constants"
import { BurnJettonsDto } from "../dto/burn-jettons.dto"
import { ConfirmBlockDto } from "../dto/confirm-block.dto"
import { ConfirmTransferDto } from "../dto/confirm-transfer.dto"
import { GetTransactionDto } from "../dto/get-transaction.dto"
import { TransferFeeDto } from "../dto/transfer-fee.dto"
import { TransferTokensDto } from "../dto/transfer-tokens.dto"
import { SwapStatus } from "../enums/swap-status.enum"
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

	@Process(CONFIRM_TON_TRANSFER_JOB)
	async conifrmTonTransfer(job: Job<ConfirmTransferDto>): Promise<SwapStatus> {
		const { data } = job
		this.logger.debug(`${data.swapId}: Start confirming transfer in block ${data.blockNumber}`)

		let swap = await this.swapsService.findById(data.swapId)
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

		const incomingTransaction = await this.tonBlockchain.matchTransaction(
			swap.sourceWallet.conjugatedAddress,
			swap.createdAt,
			JettonTransactionType.INCOMING,
		)

		if (!incomingTransaction.sourceAddress) {
			await this.swapsService.update(swap.id, { status: SwapStatus.Failed })

			await this.walletsService.update(swap.sourceWallet.id, { inUse: false })

			this.logger.error(`${swap.id}: Input transaction has no source address`)
			return SwapStatus.Failed
		}

		if (!incomingTransaction.amount.eq(swap.sourceAmount)) {
			try {
				swap = this.swapsService.recalculateSwap(swap, incomingTransaction.amount)
			} catch (err: unknown) {
				await this.swapsService.update(swap.id, { status: SwapStatus.Failed })

				await this.walletsService.update(swap.sourceWallet.id, { inUse: false })

				this.logger.error(`${swap.id}: Swap not recalculated: ${err}`)
				return SwapStatus.Failed
			}
		}

		const minterAdminWallet = await this.walletsService.findRandomOne(
			Blockchain.TON,
			WalletType.Minter,
		)
		if (!minterAdminWallet) {
			this.logger.error(`${data.swapId}: Admin wallet of jetton minter not found`)
			return SwapStatus.Failed
		}

		const sourceConjugatedAddress = await this.tonContract.getJettonWalletAddress(
			minterAdminWallet.address,
			incomingTransaction.sourceAddress,
		)

		const outgoingTransaction = await this.tonBlockchain.matchTransaction(
			sourceConjugatedAddress,
			swap.createdAt,
			JettonTransactionType.OUTGOING,
		)

		await this.swapsService.update(
			swap.id,
			{
				sourceAddress: this.tonBlockchain.normalizeAddress(
					incomingTransaction.sourceAddress,
				),
				sourceConjugatedAddress:
					this.tonBlockchain.normalizeAddress(sourceConjugatedAddress),
				sourceAmount: swap.sourceAmount,
				sourceTransactionId: outgoingTransaction.id,
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

	@OnQueueFailed({ name: CONFIRM_TON_TRANSFER_JOB })
	async onConfirmTonTransferFailed(job: Job<ConfirmTransferDto>, err: Error): Promise<void> {
		const { data } = job
		this.emitEvent(data.swapId, SwapStatus.Pending, 0)
		this.logger.debug(`${data.swapId}: ${err.message}: Retrying...`)

		await this.sourceSwapsQueue.add(
			CONFIRM_TON_TRANSFER_JOB,
			{
				swapId: data.swapId,
				blockNumber: data.blockNumber,
			} as ConfirmTransferDto,
			{
				delay: TON_BLOCK_TRACKING_INTERVAL,
				priority: QUEUE_HIGH_PRIORITY,
			},
		)
	}

	@OnQueueCompleted({ name: CONFIRM_TON_TRANSFER_JOB })
	async onConfirmTonTransferCompleted(
		job: Job<ConfirmTransferDto>,
		resultStatus: SwapStatus,
	): Promise<void> {
		const { data } = job
		if (!this.isSwapProcessable(resultStatus)) {
			this.emitEvent(data.swapId, resultStatus, 0)
			return
		}

		this.emitEvent(data.swapId, SwapStatus.Confirmed, 1)
		this.logger.log(`${data.swapId}: Transfer confirmed 1 time with block ${data.blockNumber}`)

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
		this.logger.debug(`${data.swapId}: Start confirming transfer in block ${data.blockNumber}`)

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
			`${data.swapId}: Transfer confirmed ${data.confirmations} times with block ${data.blockNumber}`,
		)

		if (data.confirmations < TOTAL_SWAP_CONFIRMATIONS) {
			await this.sourceSwapsQueue.add(
				CONFIRM_TON_BLOCK_JOB,
				{
					swapId: data.swapId,
					blockNumber: data.blockNumber + 1,
					confirmations: data.confirmations + 1,
				} as ConfirmBlockDto,
				{
					delay: TON_BLOCK_TRACKING_INTERVAL,
					priority: QUEUE_HIGH_PRIORITY,
				},
			)
			return
		}

		await this.destinationSwapsQueue.add(
			TRANSFER_ETH_TOKENS_JOB,
			{ swapId: data.swapId } as TransferTokensDto,
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

		const minterAdminWallet = await this.walletsService.findRandomOne(
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
			new BigNumber(TRANSFER_JETTON_GAS),
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
			GET_TON_FEE_TRANSACTION_JOB,
			{ swapId: data.swapId } as GetTransactionDto,
			{
				delay: TON_BLOCK_TRACKING_INTERVAL,
				priority: QUEUE_LOW_PRIORITY,
			},
		)
	}

	@Process(GET_TON_FEE_TRANSACTION_JOB)
	async getTonFeeTransaction(job: Job<GetTransactionDto>): Promise<void> {
		const { data } = job
		this.logger.debug(`${data.swapId}: Start getting fee transaction`)

		const swap = await this.swapsService.findById(data.swapId)
		if (!swap) {
			this.logger.error(`${data.swapId}: Swap not found`)
			return
		}

		if (swap.expiresAt < new Date()) {
			this.logger.warn(`${swap.id}: Swap expired`)
			return
		}

		const minterAdminWallet = await this.walletsService.findRandomOne(
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

		const incomingTransaction = await this.tonBlockchain.matchTransaction(
			conjugatedAddress,
			swap.createdAt,
			JettonTransactionType.INCOMING,
		)

		await this.swapsService.update(swap.id, { collectorTransactionId: incomingTransaction.id })
	}

	@OnQueueFailed({ name: GET_TON_FEE_TRANSACTION_JOB })
	async onGetTonFeeTransactionFailed(job: Job<GetTransactionDto>, err: Error): Promise<void> {
		const { data } = job
		this.logger.debug(`${data.swapId}: ${err.message}: Retrying...`)

		await this.sourceSwapsQueue.add(
			GET_TON_FEE_TRANSACTION_JOB,
			{ swapId: data.swapId } as GetTransactionDto,
			{
				delay: TON_BLOCK_TRACKING_INTERVAL,
				priority: QUEUE_LOW_PRIORITY,
			},
		)
	}

	@OnQueueCompleted({ name: GET_TON_FEE_TRANSACTION_JOB })
	async onGetTonFeeTransactionCompleted(job: Job<GetTransactionDto>): Promise<void> {
		const { data } = job
		this.logger.log(`${data.swapId}: Fee transaction gotten`)

		await this.sourceSwapsQueue.add(
			BURN_TON_JETTONS_JOB,
			{ swapId: data.swapId } as BurnJettonsDto,
			{ priority: QUEUE_LOW_PRIORITY },
		)
	}

	@Process(BURN_TON_JETTONS_JOB)
	async burnTonJettons(job: Job<BurnJettonsDto>): Promise<void> {
		const { data } = job
		this.logger.debug(`${data.swapId}: Start burning jettons`)

		const swap = await this.swapsService.findById(data.swapId)
		if (!swap) {
			this.logger.error(`${data.swapId}: Swap not found`)
			return
		}

		if (swap.expiresAt < new Date()) {
			this.logger.warn(`${swap.id}: Swap expired`)
			return
		}

		const minterAdminWallet = await this.walletsService.findRandomOne(
			Blockchain.TON,
			WalletType.Minter,
		)
		if (!minterAdminWallet) {
			this.logger.warn(`${data.swapId}: Admin wallet of jetton minter not found`)
			return
		}

		const walletSigner = this.tonContract.createWalletSigner(swap.sourceWallet.secretKey)
		await this.tonContract.burnJettons(
			walletSigner,
			minterAdminWallet.address,
			new BigNumber(swap.destinationAmount),
			new BigNumber(BURN_JETTON_GAS),
		)
	}

	@OnQueueFailed({ name: BURN_TON_JETTONS_JOB })
	async onBurnTonJettonsFailed(job: Job<BurnJettonsDto>, err: Error): Promise<void> {
		const { data } = job
		this.logger.debug(`${data.swapId}: ${err.message}: Retrying...`)

		await this.sourceSwapsQueue.add(
			BURN_TON_JETTONS_JOB,
			{ swapId: data.swapId } as BurnJettonsDto,
			{
				delay: TON_BLOCK_TRACKING_INTERVAL,
				priority: QUEUE_LOW_PRIORITY,
			},
		)
	}

	@OnQueueCompleted({ name: BURN_TON_JETTONS_JOB })
	async onBurnTonJettonsCompleted(job: Job<BurnJettonsDto>): Promise<void> {
		const { data } = job
		this.logger.log(`${data.swapId}: Jettons burned`)

		// await this.sourceSwapsQueue.add(
		// 	GET_TON_BURN_TRANSACTION_JOB,
		// 	{ swapId: data.swapId } as GetTransactionDto,
		// 	{
		// 		delay: TON_BLOCK_TRACKING_INTERVAL,
		// 		priority: QUEUE_LOW_PRIORITY,
		// 	},
		// )
	}

	// @Process(GET_TON_BURN_TRANSACTION_JOB)
	// async getTonBurnTransaction(job: Job<GetTransactionDto>): Promise<void> {
	// 	const { data } = job
	// 	this.logger.debug(`${data.swapId}: Start getting burn transaction`)

	// 	const swap = await this.swapsService.findById(data.swapId)
	// 	if (!swap) {
	// 		this.logger.error(`${data.swapId}: Swap not found`)
	// 		return
	// 	}

	// 	if (swap.expiresAt < new Date()) {
	// 		this.logger.warn(`${swap.id}: Swap expired`)
	// 		return
	// 	}

	// 	const minterAdminWallet = await this.walletsService.findRandomOne(
	// 		Blockchain.TON,
	// 		WalletType.Minter,
	// 	)
	// 	if (!minterAdminWallet) {
	// 		this.logger.warn(`${data.swapId}: Admin wallet of jetton minter not found`)
	// 		return
	// 	}

	// 	const incomingTransaction = await this.tonBlockchain.matchTransaction(
	// 		swap.sourceWallet.conjugatedAddress,
	// 		swap.createdAt,
	// 		JettonTransactionType.INCOMING,
	// 	)

	// 	await this.swapsService.update(swap.id, { burnTransactionId: incomingTransaction.id })

	// 	this.logger.log(`${data.swapId}: Burn transaction gotten`)
	// }

	// @OnQueueFailed({ name: GET_TON_BURN_TRANSACTION_JOB })
	// async onGetTonBurnTransactionFailed(job: Job<GetTransactionDto>, err: Error): Promise<void> {
	// 	const { data } = job
	// 	this.logger.debug(`${data.swapId}: ${err.message}: Retrying...`)

	// 	await this.sourceSwapsQueue.add(
	// 		GET_TON_BURN_TRANSACTION_JOB,
	// 		{ swapId: data.swapId } as GetTransactionDto,
	// 		{
	// 			delay: TON_BLOCK_TRACKING_INTERVAL,
	// 			priority: QUEUE_LOW_PRIORITY,
	// 		},
	// 	)
	// }
}
