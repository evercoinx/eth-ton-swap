import { InjectQueue, OnQueueCompleted, OnQueueFailed, Process, Processor } from "@nestjs/bull"
import { Logger } from "@nestjs/common"
import BigNumber from "bignumber.js"
import { Job, Queue } from "bull"
import {
	ATTEMPT_COUNT_EXTENDED,
	ATTEMPT_COUNT_ULTIMATE,
	ERROR_JETTON_MINTER_ADMIN_WALLET_NOT_FOUND,
	ERROR_SWAP_EXPIRED,
	ERROR_SWAP_NOT_FOUND,
	QUEUE_HIGH_PRIORITY,
	QUEUE_LOW_PRIORITY,
} from "src/common/constants"
import { Blockchain } from "src/common/enums/blockchain.enum"
import { EventsService } from "src/common/providers/events.service"
import { Quantity } from "src/common/providers/quantity"
import {
	BURN_JETTON_GAS,
	TON_BLOCK_TRACKING_INTERVAL,
	TRANSFER_JETTON_GAS,
} from "src/ton/constants"
import { JettonOperation } from "src/ton/enums/jetton-operation.enum"
import { TonBlockchainService } from "src/ton/providers/ton-blockchain.service"
import { TonContractService } from "src/ton/providers/ton-contract.service"
import { WalletType } from "src/wallets/enums/wallet-type.enum"
import { WalletsRepository } from "src/wallets/providers/wallets.repository"
import {
	BURN_TON_JETTONS_JOB,
	CONFIRM_TON_TRANSFER_JOB,
	ETH_DESTINATION_SWAPS_QUEUE,
	GET_TON_BURN_TRANSACTION_JOB,
	GET_TON_FEE_TRANSACTION_JOB,
	TON_SOURCE_SWAPS_QUEUE,
	TON_TOTAL_CONFIRMATIONS,
	TRANSFER_ETH_TOKENS_JOB,
	TRANSFER_TON_FEE_JOB,
} from "../constants"
import { BurnJettonsDto } from "../dto/burn-jettons.dto"
import { ConfirmTransferDto } from "../dto/confirm-transfer.dto"
import { GetTransactionDto } from "../dto/get-transaction.dto"
import { TransferFeeDto } from "../dto/transfer-fee.dto"
import { TransferTokensDto } from "../dto/transfer-tokens.dto"
import { SwapStatus } from "../enums/swap-status.enum"
import { SwapEvent } from "../interfaces/swap-event.interface"
import { SwapResult } from "../interfaces/swap-result.interface"
import { SwapsHelper } from "../providers/swaps.helper"
import { SwapsRepository } from "../providers/swaps.repository"

@Processor(TON_SOURCE_SWAPS_QUEUE)
export class TonSourceSwapsProcessor {
	private readonly logger = new Logger(TonSourceSwapsProcessor.name)

	constructor(
		@InjectQueue(TON_SOURCE_SWAPS_QUEUE) private readonly sourceSwapsQueue: Queue,
		@InjectQueue(ETH_DESTINATION_SWAPS_QUEUE) private readonly destinationSwapsQueue: Queue,
		private readonly swapsRepository: SwapsRepository,
		private readonly walletsRepository: WalletsRepository,
		private readonly tonBlockchainService: TonBlockchainService,
		private readonly tonContractService: TonContractService,
		private readonly eventsService: EventsService,
		private readonly swapsHelper: SwapsHelper,
	) {}

	@Process(CONFIRM_TON_TRANSFER_JOB)
	async conifrmTonTransfer(job: Job<ConfirmTransferDto>): Promise<SwapResult> {
		const { data } = job
		this.logger.debug(`${data.swapId}: Start confirming transfer in block ${data.blockNumber}`)

		let swap = await this.swapsRepository.findById(data.swapId)
		if (!swap) {
			return this.swapsHelper.swapNotFound(data.swapId, this.logger)
		}

		if (swap.status === SwapStatus.Canceled) {
			return await this.swapsHelper.swapCanceled(swap, this.logger)
		}

		if (swap.expiresAt < new Date()) {
			return await this.swapsHelper.swapExpired(swap, this.logger)
		}

		const incomingTransaction = await this.tonBlockchainService.findTransaction(
			swap.sourceWallet.conjugatedAddress,
			swap.createdAt,
			JettonOperation.INTERNAL_TRANSFER,
		)
		if (!incomingTransaction) {
			throw new Error("Incoming jetton transfer transaction not found")
		}

		if (!incomingTransaction.amount.eq(swap.sourceAmount)) {
			try {
				swap = this.swapsHelper.recalculateSwap(swap, incomingTransaction.amount)
			} catch (err: any) {
				return await this.swapsHelper.swapNotRecalculated(swap, err, this.logger)
			}
		}

		const minterAdminWallet = await this.walletsRepository.findBestMatchedOne({
			blockchain: Blockchain.TON,
			type: WalletType.Minter,
		})
		if (!minterAdminWallet) {
			return await this.swapsHelper.jettonMinterAdminWalletNotFound(swap, this.logger)
		}

		const sourceConjugatedAddress = await this.tonContractService.getJettonWalletAddress(
			minterAdminWallet.address,
			incomingTransaction.sourceAddress,
		)

		const outgoingTransaction = await this.tonBlockchainService.findTransaction(
			sourceConjugatedAddress,
			swap.createdAt,
			JettonOperation.TRANSFER,
		)
		if (!outgoingTransaction) {
			throw new Error("Outgoing jetton transfer transaction not found")
		}

		const result = { status: SwapStatus.Confirmed }
		await this.swapsRepository.update(swap.id, {
			sourceAddress: this.tonBlockchainService.normalizeAddress(
				incomingTransaction.sourceAddress,
			),
			sourceConjugatedAddress:
				this.tonBlockchainService.normalizeAddress(sourceConjugatedAddress),
			sourceAmount: new Quantity(swap.sourceAmount, swap.sourceToken.decimals),
			sourceTokenDecimals: swap.sourceToken.decimals,
			sourceTransactionId: outgoingTransaction.id,
			destinationAmount: new Quantity(swap.destinationAmount, swap.destinationToken.decimals),
			destinationTokenDecimals: swap.destinationToken.decimals,
			fee: new Quantity(swap.fee, swap.sourceToken.decimals),
			status: result.status,
			confirmations: 1,
		})

		const newBalance = new BigNumber(swap.sourceWallet.balance).plus(swap.sourceAmount)
		await this.walletsRepository.update(swap.sourceWallet.id, {
			balance: new Quantity(newBalance, swap.sourceToken.decimals),
			inUse: false,
		})

		return result
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
		result: SwapResult,
	): Promise<void> {
		const { data } = job
		const { status, statusCode } = result

		const isSwapProcessable = this.swapsHelper.isSwapProcessable(status)
		this.eventsService.emit({
			id: data.swapId,
			status,
			statusCode,
			currentConfirmations: isSwapProcessable ? 1 : 0,
			totalConfirmations: TON_TOTAL_CONFIRMATIONS,
		} as SwapEvent)

		if (!isSwapProcessable) {
			return
		}

		this.logger.log(`${data.swapId}: Transfer confirmed in block ${data.blockNumber}`)

		await this.destinationSwapsQueue.add(
			TRANSFER_ETH_TOKENS_JOB,
			{ swapId: data.swapId } as TransferTokensDto,
			{
				attempts: ATTEMPT_COUNT_EXTENDED,
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

		const swap = await this.swapsRepository.findById(data.swapId)
		if (!swap) {
			this.logger.error(`${data.swapId}: ${ERROR_SWAP_NOT_FOUND}`, undefined)
			return
		}

		if (swap.ultimateExpiresAt < new Date()) {
			this.logger.warn(`${swap.id}: ${ERROR_SWAP_EXPIRED}`)
			return
		}

		const minterAdminWallet = await this.walletsRepository.findBestMatchedOne({
			blockchain: Blockchain.TON,
			type: WalletType.Minter,
		})
		if (!minterAdminWallet) {
			this.logger.error(
				`${data.swapId}: ${ERROR_JETTON_MINTER_ADMIN_WALLET_NOT_FOUND}`,
				undefined,
			)
			return
		}

		const walletSigner = await this.tonContractService.createWalletSigner(
			swap.sourceWallet.secretKey,
		)

		await this.tonContractService.transferJettons(
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
				attempts: ATTEMPT_COUNT_ULTIMATE,
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

		const swap = await this.swapsRepository.findById(data.swapId)
		if (!swap) {
			this.logger.error(`${data.swapId}: ${ERROR_SWAP_NOT_FOUND}`, undefined)
			return
		}

		if (swap.ultimateExpiresAt < new Date()) {
			this.logger.warn(`${swap.id}: ${ERROR_SWAP_EXPIRED}`)
			return
		}

		const transaction = await this.tonBlockchainService.findTransaction(
			swap.collectorWallet.conjugatedAddress,
			swap.createdAt,
			JettonOperation.INTERNAL_TRANSFER,
		)
		if (!transaction) {
			throw new Error("Incoming fee transfer transaction not found")
		}

		await this.swapsRepository.update(swap.id, { collectorTransactionId: transaction.id })

		const newBalance = new BigNumber(swap.sourceWallet.balance).minus(swap.fee)
		await this.walletsRepository.update(swap.sourceWallet.id, {
			balance: new Quantity(newBalance, swap.sourceToken.decimals),
		})
	}

	@OnQueueCompleted({ name: GET_TON_FEE_TRANSACTION_JOB })
	async onGetTonFeeTransactionCompleted(job: Job<GetTransactionDto>): Promise<void> {
		const { data } = job
		this.logger.log(`${data.swapId}: Fee transfer transaction found`)

		await this.sourceSwapsQueue.add(
			BURN_TON_JETTONS_JOB,
			{ swapId: data.swapId } as BurnJettonsDto,
			{
				attempts: ATTEMPT_COUNT_ULTIMATE,
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

		const swap = await this.swapsRepository.findById(data.swapId)
		if (!swap) {
			this.logger.error(`${data.swapId}: ${ERROR_SWAP_NOT_FOUND}`, undefined)
			return
		}

		if (swap.ultimateExpiresAt < new Date()) {
			this.logger.warn(`${swap.id}: ${ERROR_SWAP_EXPIRED}`)
			return
		}

		const minterAdminWallet = await this.walletsRepository.findBestMatchedOne({
			blockchain: Blockchain.TON,
			type: WalletType.Minter,
		})
		if (!minterAdminWallet) {
			this.logger.error(
				`${data.swapId}: ${ERROR_JETTON_MINTER_ADMIN_WALLET_NOT_FOUND}`,
				undefined,
			)
			return
		}

		const walletSigner = await this.tonContractService.createWalletSigner(
			swap.sourceWallet.secretKey,
		)

		await this.tonContractService.burnJettons(
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

		await this.sourceSwapsQueue.add(
			GET_TON_BURN_TRANSACTION_JOB,
			{ swapId: data.swapId } as GetTransactionDto,
			{
				attempts: ATTEMPT_COUNT_ULTIMATE,
				delay: TON_BLOCK_TRACKING_INTERVAL,
				priority: QUEUE_LOW_PRIORITY,
				backoff: {
					type: "exponential",
					delay: TON_BLOCK_TRACKING_INTERVAL,
				},
			},
		)
	}

	@Process(GET_TON_BURN_TRANSACTION_JOB)
	async getTonBurnTransaction(job: Job<GetTransactionDto>): Promise<void> {
		const { data } = job
		this.logger.debug(`${data.swapId}: Start finding burn transaction`)

		const swap = await this.swapsRepository.findById(data.swapId)
		if (!swap) {
			this.logger.warn(`${data.swapId}: ${ERROR_SWAP_NOT_FOUND}`)
			return
		}

		if (swap.ultimateExpiresAt < new Date()) {
			this.logger.warn(`${swap.id}: ${ERROR_SWAP_EXPIRED}`)
			return
		}

		const minterAdminWallet = await this.walletsRepository.findBestMatchedOne({
			blockchain: Blockchain.TON,
			type: WalletType.Minter,
		})
		if (!minterAdminWallet) {
			this.logger.error(
				`${data.swapId}: ${ERROR_JETTON_MINTER_ADMIN_WALLET_NOT_FOUND}`,
				undefined,
			)
			return
		}

		const transaction = await this.tonBlockchainService.findTransaction(
			swap.sourceWallet.conjugatedAddress,
			swap.createdAt,
			JettonOperation.BURN,
		)
		if (!transaction) {
			throw new Error("Burn transaction not found")
		}

		await this.swapsRepository.update(swap.id, { burnTransactionId: transaction.id })

		const newBalance = new BigNumber(swap.sourceWallet.balance).minus(swap.destinationAmount)
		await this.walletsRepository.update(swap.sourceWallet.id, {
			balance: new Quantity(newBalance, swap.sourceToken.decimals),
		})

		this.logger.log(`${data.swapId}: Burn transaction found`)
	}
}
