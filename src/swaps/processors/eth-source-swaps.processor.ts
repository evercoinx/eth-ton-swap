import { InjectQueue, OnQueueCompleted, OnQueueFailed, Process, Processor } from "@nestjs/bull"
import { Logger } from "@nestjs/common"
import BigNumber from "bignumber.js"
import { Job, Queue } from "bull"
import {
	ATTEMPT_COUNT_EXTENDED,
	ATTEMPT_COUNT_NORMAL,
	ERROR_SWAP_EXPIRED,
	ERROR_SWAP_NOT_FOUND,
	QUEUE_HIGH_PRIORITY,
} from "src/common/constants"
import { EventsService } from "src/common/providers/events.service"
import { Quantity } from "src/common/providers/quantity"
import { ETH_BLOCK_TRACKING_INTERVAL } from "src/ethereum/constants"
import { EthereumBlockchainService } from "src/ethereum/providers/ethereum-blockchain.service"
import { EthereumConractService } from "src/ethereum/providers/ethereum-contract.service"
import { TON_BLOCK_TRACKING_INTERVAL } from "src/ton/constants"
import { WalletsRepository } from "src/wallets/providers/wallets.repository"
import {
	CONFIRM_ETH_TRANSFER_JOB,
	ETH_SOURCE_SWAPS_QUEUE,
	ETH_TOTAL_CONFIRMATIONS,
	MINT_TON_JETTONS_JOB,
	TON_DESTINATION_SWAPS_QUEUE,
	TRANSFER_ETH_FEE_JOB,
	WAIT_FOR_ETH_TRANSFER_CONFIRMATION,
} from "../constants"
import { ConfirmTransferDto } from "../dto/confirm-transfer.dto"
import { MintJettonsDto } from "../dto/mint-jettons.dto"
import { TransferFeeDto } from "../dto/transfer-fee.dto"
import { WaitForTransferConfirmationDto } from "../dto/wait-for-eth-transfer-confirmation.dto"
import { SwapStatus } from "../enums/swap-status.enum"
import { SwapEvent } from "../interfaces/swap-event.interface"
import { SwapResult } from "../interfaces/swap-result.interface"
import { EthereumCacheHelper } from "../providers/ethereum-cache.helper"
import { SwapsHelper } from "../providers/swaps.helper"
import { SwapsRepository } from "../providers/swaps.repository"

@Processor(ETH_SOURCE_SWAPS_QUEUE)
export class EthSourceSwapsProcessor {
	private readonly logger = new Logger(EthSourceSwapsProcessor.name)

	constructor(
		@InjectQueue(ETH_SOURCE_SWAPS_QUEUE) private readonly sourceSwapsQueue: Queue,
		@InjectQueue(TON_DESTINATION_SWAPS_QUEUE) private readonly destinationSwapsQueue: Queue,
		private readonly swapsRepository: SwapsRepository,
		private readonly walletsRepository: WalletsRepository,
		private readonly ethereumBlockchainService: EthereumBlockchainService,
		private readonly ethereumContractService: EthereumConractService,
		private readonly ethereumCacheHelper: EthereumCacheHelper,
		private readonly eventsService: EventsService,
		private readonly swapsHelper: SwapsHelper,
	) {}

	@Process(CONFIRM_ETH_TRANSFER_JOB)
	async confirmEthTransfer(job: Job<ConfirmTransferDto>): Promise<SwapResult> {
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

		const currentBlock = await this.ethereumCacheHelper.getBlockWithTransactions(
			data.blockNumber,
		)

		const logs = await this.ethereumBlockchainService.getLogs(
			swap.sourceToken.address,
			currentBlock.number - 5,
			currentBlock.number,
		)

		for (const log of logs) {
			const transferLog = this.ethereumContractService.findTransferLog(
				log,
				swap.sourceWallet.address,
				swap.sourceToken.decimals,
			)
			if (!transferLog) {
				continue
			}

			if (!transferLog.amount.eq(swap.sourceAmount)) {
				try {
					swap = this.swapsHelper.recalculateSwap(swap, transferLog.amount)
				} catch (err: any) {
					return await this.swapsHelper.swapNotRecalculated(swap, err, this.logger)
				}
			}

			const result = this.swapsHelper.toSwapResult(
				SwapStatus.Confirmed,
				undefined,
				transferLog.transactionId,
			)
			await this.swapsRepository.update(swap.id, {
				sourceAddress: this.ethereumBlockchainService.normalizeAddress(
					transferLog.sourceAddress,
				),
				sourceAmount: new Quantity(swap.sourceAmount, swap.sourceToken.decimals),
				sourceTransactionId: transferLog.transactionId,
				destinationAmount: new Quantity(
					swap.destinationAmount,
					swap.destinationToken.decimals,
				),
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

		throw new Error("Token transfer transaction not found")
	}

	@OnQueueFailed({ name: CONFIRM_ETH_TRANSFER_JOB })
	async onConfirmEthTransferFailed(job: Job<ConfirmTransferDto>, err: Error): Promise<void> {
		const { data } = job
		await this.sourceSwapsQueue.add(
			CONFIRM_ETH_TRANSFER_JOB,
			{
				...data,
				blockNumber: err.message?.endsWith("transaction not found")
					? data.blockNumber + 1
					: data.blockNumber,
			} as ConfirmTransferDto,
			{
				delay: ETH_BLOCK_TRACKING_INTERVAL,
				priority: QUEUE_HIGH_PRIORITY,
			},
		)
	}

	@OnQueueCompleted({ name: CONFIRM_ETH_TRANSFER_JOB })
	async onConfirmEthTransferCompleted(
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
			totalConfirmations: ETH_TOTAL_CONFIRMATIONS,
		} as SwapEvent)

		if (!isSwapProcessable) {
			return
		}

		this.logger.log(`${data.swapId}: Transfer confirmed in block ${data.blockNumber}`)

		await this.sourceSwapsQueue.add(
			WAIT_FOR_ETH_TRANSFER_CONFIRMATION,
			{
				swapId: data.swapId,
				transactionId: result.transactionId,
				confirmations: 2,
			} as WaitForTransferConfirmationDto,
			{
				attempts: ATTEMPT_COUNT_NORMAL,
				delay: ETH_BLOCK_TRACKING_INTERVAL,
				priority: QUEUE_HIGH_PRIORITY,
				backoff: {
					type: "fixed",
					delay: ETH_BLOCK_TRACKING_INTERVAL,
				},
			},
		)
	}

	@Process(WAIT_FOR_ETH_TRANSFER_CONFIRMATION)
	async waitForEthTransferConfirmation(
		job: Job<WaitForTransferConfirmationDto>,
	): Promise<SwapResult> {
		const { data } = job
		this.logger.debug(
			`${data.swapId}: Start waiting for ${data.confirmations} transfer confirmation`,
		)

		const swap = await this.swapsRepository.findById(data.swapId)
		if (!swap) {
			return this.swapsHelper.swapNotFound(data.swapId, this.logger)
		}

		if (swap.expiresAt < new Date()) {
			return await this.swapsHelper.swapExpired(swap, this.logger)
		}

		await this.ethereumBlockchainService.waitForTransaction(
			data.transactionId,
			data.confirmations,
		)

		const result = this.swapsHelper.toSwapResult(SwapStatus.Confirmed)
		await this.swapsRepository.update(swap.id, {
			status: result.status,
			statusCode: result.statusCode,
			confirmations: data.confirmations,
		})

		return result
	}

	@OnQueueCompleted({ name: WAIT_FOR_ETH_TRANSFER_CONFIRMATION })
	async onWaitForEthTransferConfirmationCompleted(
		job: Job<WaitForTransferConfirmationDto>,
		result: SwapResult,
	): Promise<void> {
		const { data } = job
		const { status, statusCode } = result

		this.eventsService.emit({
			id: data.swapId,
			status,
			statusCode,
			currentConfirmations: data.confirmations,
			totalConfirmations: ETH_TOTAL_CONFIRMATIONS,
		} as SwapEvent)

		if (!this.swapsHelper.isSwapProcessable(status)) {
			return
		}

		this.logger.log(`${data.swapId}: Transfer confirmed ${data.confirmations} times`)

		if (data.confirmations < ETH_TOTAL_CONFIRMATIONS) {
			await this.sourceSwapsQueue.add(
				WAIT_FOR_ETH_TRANSFER_CONFIRMATION,
				{
					...data,
					confirmations: data.confirmations + 1,
				} as WaitForTransferConfirmationDto,
				{
					delay: ETH_BLOCK_TRACKING_INTERVAL,
					priority: QUEUE_HIGH_PRIORITY,
				},
			)
			return
		}

		await this.destinationSwapsQueue.add(
			MINT_TON_JETTONS_JOB,
			{ swapId: data.swapId } as MintJettonsDto,
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

	@Process(TRANSFER_ETH_FEE_JOB)
	async transferEthFee(job: Job<TransferFeeDto>): Promise<void> {
		const { data } = job
		this.logger.debug(`${data.swapId}: Start transferring fee`)

		const swap = await this.swapsRepository.findById(data.swapId)
		if (!swap) {
			this.logger.error(`${data.swapId}: ${ERROR_SWAP_NOT_FOUND}`)
			return
		}

		if (swap.ultimateExpiresAt < new Date()) {
			this.logger.warn(`${swap.id}: ${ERROR_SWAP_EXPIRED}`)
			return
		}

		const gasPrice = await this.ethereumCacheHelper.getGasPrice()

		const tokenContract = await this.ethereumContractService.createTokenContract(
			swap.sourceToken.address,
			swap.sourceWallet.secretKey,
		)

		const transactionId = await this.ethereumContractService.transferTokens(
			tokenContract,
			swap.collectorWallet.address,
			new BigNumber(swap.fee),
			swap.sourceToken.decimals,
			gasPrice,
		)

		await this.ethereumBlockchainService.waitForTransaction(
			transactionId,
			ETH_TOTAL_CONFIRMATIONS,
		)

		await this.swapsRepository.update(swap.id, { collectorTransactionId: transactionId })

		const newBalance = new BigNumber(swap.sourceWallet.balance).minus(swap.fee)
		await this.walletsRepository.update(swap.sourceWallet.id, {
			balance: new Quantity(newBalance, swap.sourceToken.decimals),
		})

		this.logger.log(`${data.swapId}: Fee transferred`)
	}
}
