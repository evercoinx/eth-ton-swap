import { InjectQueue, OnQueueCompleted, OnQueueFailed, Process, Processor } from "@nestjs/bull"
import { CACHE_MANAGER, Inject, Logger } from "@nestjs/common"
import BigNumber from "bignumber.js"
import { Job, Queue } from "bull"
import { Cache } from "cache-manager"
import { QUEUE_HIGH_PRIORITY, QUEUE_LOW_PRIORITY } from "src/common/constants"
import { Blockchain } from "src/common/enums/blockchain.enum"
import { EventsService } from "src/common/events.service"
import {
	BURN_JETTON_GAS,
	TON_BLOCK_TRACKING_INTERVAL,
	TRANSFER_JETTON_GAS,
} from "src/ton/constants"
import { TransactionType } from "src/ton/enums/transaction-type.enum"
import { TonBlockchainProvider } from "src/ton/ton-blockchain.provider"
import { TonContractProvider } from "src/ton/ton-contract.provider"
import { WalletType } from "src/wallets/enums/wallet-type.enum"
import { WalletsService } from "src/wallets/wallets.service"
import {
	BURN_TON_JETTONS_JOB,
	CONFIRM_TON_TRANSFER_JOB,
	ETH_DESTINATION_SWAPS_QUEUE,
	GET_TON_FEE_TRANSACTION_JOB,
	TON_SOURCE_SWAPS_QUEUE,
	TON_TOTAL_SWAP_CONFIRMATIONS,
	TRANSFER_ETH_TOKENS_JOB,
	TRANSFER_TON_FEE_JOB,
} from "../constants"
import { BurnJettonsDto } from "../dto/burn-jettons.dto"
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

		const incomingTransaction = await this.tonBlockchain.findTransaction(
			swap.sourceWallet.conjugatedAddress,
			swap.createdAt,
			TransactionType.INCOMING,
		)
		if (!incomingTransaction) {
			throw new Error("Incoming jetton transfer transaction not found")
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

		const outgoingTransaction = await this.tonBlockchain.findTransaction(
			sourceConjugatedAddress,
			swap.createdAt,
			TransactionType.OUTGOING,
		)
		if (!outgoingTransaction) {
			throw new Error("Outgoing jetton transfer transaction not found")
		}

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
				confirmations: 1,
			},
			swap.sourceToken.decimals,
			swap.destinationToken.decimals,
		)

		const balance = new BigNumber(swap.sourceWallet.balance)
			.plus(swap.sourceAmount)
			.toFixed(swap.sourceToken.decimals)

		await this.walletsService.update(swap.sourceWallet.id, {
			balance,
			inUse: false,
		})

		return SwapStatus.Confirmed
	}

	@OnQueueFailed({ name: CONFIRM_TON_TRANSFER_JOB })
	async onConfirmTonTransferFailed(job: Job<ConfirmTransferDto>, err: Error): Promise<void> {
		const { data } = job
		await this.sourceSwapsQueue.add(
			CONFIRM_TON_TRANSFER_JOB,
			{
				...data,
				blockNumber: err.message?.endsWith("transaction not found")
					? data.blockNumber + 1
					: data.blockNumber,
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
		result: SwapStatus,
	): Promise<void> {
		const { data } = job
		if (!this.isSwapProcessable(result)) {
			this.emitEvent(data.swapId, result, 0, TON_TOTAL_SWAP_CONFIRMATIONS)
			return
		}

		this.emitEvent(data.swapId, SwapStatus.Confirmed, 1)
		this.logger.log(`${data.swapId}: Transfer confirmed in block ${data.blockNumber}`)

		await this.destinationSwapsQueue.add(
			TRANSFER_ETH_TOKENS_JOB,
			{ swapId: data.swapId } as TransferTokensDto,
			{
				priority: QUEUE_HIGH_PRIORITY,
				backoff: {
					type: "fixed",
					delay: TON_BLOCK_TRACKING_INTERVAL,
				},
			},
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

		if (swap.largeExpiresAt < new Date()) {
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
				backoff: {
					type: "exponential",
					delay: TON_BLOCK_TRACKING_INTERVAL,
				},
			},
		)
	}

	@Process(GET_TON_FEE_TRANSACTION_JOB)
	async getTonFeeTransaction(job: Job<GetTransactionDto>): Promise<void> {
		const { data } = job
		this.logger.debug(`${data.swapId}: Start finding fee transaction`)

		const swap = await this.swapsService.findById(data.swapId)
		if (!swap) {
			this.logger.error(`${data.swapId}: Swap not found`)
			return
		}

		if (swap.largeExpiresAt < new Date()) {
			this.logger.warn(`${swap.id}: Swap expired`)
			return
		}

		const incomingTransaction = await this.tonBlockchain.findTransaction(
			swap.collectorWallet.conjugatedAddress,
			swap.createdAt,
			TransactionType.INCOMING,
		)
		if (!incomingTransaction) {
			throw new Error("Incoming fee transfer transaction not found")
		}

		await this.swapsService.update(swap.id, { collectorTransactionId: incomingTransaction.id })

		const balance = new BigNumber(swap.sourceWallet.balance)
			.minus(swap.fee)
			.toFixed(swap.sourceToken.decimals)

		await this.walletsService.update(swap.sourceWallet.id, { balance })
	}

	@OnQueueCompleted({ name: GET_TON_FEE_TRANSACTION_JOB })
	async onGetTonFeeTransactionCompleted(job: Job<GetTransactionDto>): Promise<void> {
		const { data } = job
		this.logger.log(`${data.swapId}: Fee transfer transaction found`)

		await this.sourceSwapsQueue.add(
			BURN_TON_JETTONS_JOB,
			{ swapId: data.swapId } as BurnJettonsDto,
			{
				priority: QUEUE_LOW_PRIORITY,
				backoff: {
					type: "exponential",
					delay: TON_BLOCK_TRACKING_INTERVAL,
				},
			},
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

		if (swap.largeExpiresAt < new Date()) {
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
	// 	this.logger.debug(`${data.swapId}: Start finding burn transaction`)

	// 	const swap = await this.swapsService.findById(data.swapId)
	// 	if (!swap) {
	// 		this.logger.warn(`${data.swapId}: Swap not found`)
	// 		return
	// 	}

	// if (swap.largeExpiresAt < new Date()) {
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

	// 	const incomingTransaction = await this.tonBlockchain.findTransaction(
	// 		swap.sourceWallet.conjugatedAddress,
	// 		swap.createdAt,
	// 		TransactionType.INCOMING,
	// 	)

	// 	await this.swapsService.update(swap.id, { burnTransactionId: incomingTransaction.id })

	// 	this.logger.log(`${data.swapId}: Burn transaction found`)
	// }
}
