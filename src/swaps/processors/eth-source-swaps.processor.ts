import { InjectQueue, OnQueueCompleted, OnQueueFailed, Process, Processor } from "@nestjs/bull"
import { Logger } from "@nestjs/common"
import BigNumber from "bignumber.js"
import { Job, Queue } from "bull"
import {
	ATTEMPT_COUNT_EXTENDED,
	ATTEMPT_COUNT_NORMAL,
	QUEUE_HIGH_PRIORITY,
} from "src/common/constants"
import { EventsService } from "src/common/events.service"
import { ETH_BLOCK_TRACKING_INTERVAL } from "src/ethereum/constants"
import { EthereumBlockchainProvider } from "src/ethereum/ethereum-blockchain.provider"
import { EthereumConractProvider } from "src/ethereum/ethereum-contract.provider"
import { TON_BLOCK_TRACKING_INTERVAL } from "src/ton/constants"
import { WalletsService } from "src/wallets/wallets.service"
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
import { getNonProcessableSwapStatuses, SwapStatus } from "../enums/swap-status.enum"
import { SwapEvent } from "../interfaces/swap-event.interface"
import { SwapResult, toSwapResult } from "../interfaces/swap-result.interface"
import { EthereumCacheHelper } from "../providers/ethereum-cache.helper"
import { SwapsService } from "../providers/swaps.service"

@Processor(ETH_SOURCE_SWAPS_QUEUE)
export class EthSourceSwapsProcessor {
	private readonly logger = new Logger(EthSourceSwapsProcessor.name)

	constructor(
		@InjectQueue(ETH_SOURCE_SWAPS_QUEUE) private readonly sourceSwapsQueue: Queue,
		@InjectQueue(TON_DESTINATION_SWAPS_QUEUE) private readonly destinationSwapsQueue: Queue,
		private readonly ethereumCacheHelper: EthereumCacheHelper,
		private readonly ethereumBlockchain: EthereumBlockchainProvider,
		private readonly ethereumContract: EthereumConractProvider,
		private readonly eventsService: EventsService,
		private readonly swapsService: SwapsService,
		private readonly walletsService: WalletsService,
	) {}

	@Process(CONFIRM_ETH_TRANSFER_JOB)
	async confirmEthTransfer(job: Job<ConfirmTransferDto>): Promise<SwapResult> {
		const { data } = job
		this.logger.debug(`${data.swapId}: Start confirming transfer in block ${data.blockNumber}`)

		let swap = await this.swapsService.findById(data.swapId)
		if (!swap) {
			this.logger.error(`${data.swapId}: Swap not found`)
			return toSwapResult(SwapStatus.Failed, "Swap not found")
		}

		if (swap.status === SwapStatus.Canceled) {
			const result = toSwapResult(SwapStatus.Canceled)
			await this.swapsService.update(swap.id, { statusCode: result.statusCode })

			await this.walletsService.update(swap.sourceWallet.id, { inUse: false })

			this.logger.warn(`${swap.id}: Swap canceled`)
			return result
		}

		if (swap.expiresAt < new Date()) {
			const result = toSwapResult(SwapStatus.Expired, "Swap expired")
			await this.swapsService.update(swap.id, {
				status: result.status,
				statusCode: result.statusCode,
			})

			await this.walletsService.update(swap.sourceWallet.id, { inUse: false })

			this.logger.error(`${swap.id}: Swap expired`)
			return result
		}

		const currentBlock = await this.ethereumCacheHelper.getBlockWithTransactions(
			data.blockNumber,
		)

		const logs = await this.ethereumBlockchain.getLogs(
			swap.sourceToken.address,
			currentBlock.number - 5,
			currentBlock.number,
		)

		for (const log of logs) {
			const transferLog = this.ethereumContract.findTransferLog(
				log,
				swap.sourceWallet.address,
				swap.sourceToken.decimals,
			)
			if (!transferLog) {
				continue
			}

			if (!transferLog.amount.eq(swap.sourceAmount)) {
				try {
					swap = this.swapsService.recalculateSwap(swap, transferLog.amount)
				} catch (err: any) {
					const result = toSwapResult(
						SwapStatus.Failed,
						`Swap not recalculated: ${err.message}`,
					)
					await this.swapsService.update(swap.id, {
						status: result.status,
						statusCode: result.statusCode,
					})

					await this.walletsService.update(swap.sourceWallet.id, { inUse: false })

					this.logger.error(`${swap.id}: Swap not recalculated: ${err}`)
					return result
				}
			}

			const result = toSwapResult(SwapStatus.Confirmed, undefined, transferLog.transactionId)
			await this.swapsService.update(
				swap.id,
				{
					sourceAddress: this.ethereumBlockchain.normalizeAddress(
						transferLog.sourceAddress,
					),
					sourceAmount: swap.sourceAmount,
					sourceTransactionId: transferLog.transactionId,
					destinationAmount: swap.destinationAmount,
					fee: swap.fee,
					status: result.status,
					statusCode: result.statusCode,
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

		if (getNonProcessableSwapStatuses().includes(result.status)) {
			this.eventsService.emit({
				status,
				statusCode,
				currentConfirmations: 0,
				totalConfirmations: ETH_TOTAL_CONFIRMATIONS,
			} as SwapEvent)
			return
		}

		this.eventsService.emit({
			status,
			statusCode,
			currentConfirmations: 1,
			totalConfirmations: ETH_TOTAL_CONFIRMATIONS,
		} as SwapEvent)

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

		const swap = await this.swapsService.findById(data.swapId)
		if (!swap) {
			this.logger.error(`${data.swapId}: Swap not found`)
			return toSwapResult(SwapStatus.Failed, "Swap not found")
		}

		if (swap.expiresAt < new Date()) {
			const result = toSwapResult(SwapStatus.Expired, "Swap expired")
			await this.swapsService.update(swap.id, {
				status: result.status,
				statusCode: result.statusCode,
			})

			await this.walletsService.update(swap.sourceWallet.id, { inUse: false })

			this.logger.error(`${swap.id}: Swap expired`)
			return result
		}

		await this.ethereumBlockchain.waitForTransaction(data.transactionId, data.confirmations)

		const result = toSwapResult(SwapStatus.Confirmed)
		await this.swapsService.update(swap.id, {
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

		if (getNonProcessableSwapStatuses().includes(result.status)) {
			this.eventsService.emit({
				status,
				statusCode,
				currentConfirmations: data.confirmations,
				totalConfirmations: ETH_TOTAL_CONFIRMATIONS,
			} as SwapEvent)
			return
		}

		this.eventsService.emit({
			status,
			statusCode,
			currentConfirmations: data.confirmations,
			totalConfirmations: ETH_TOTAL_CONFIRMATIONS,
		} as SwapEvent)
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

		const swap = await this.swapsService.findById(data.swapId)
		if (!swap) {
			this.logger.error(`${data.swapId}: Swap not found`)
			return
		}

		if (swap.ultimateExpiresAt < new Date()) {
			this.logger.warn(`${swap.id}: Swap expired`)
			return
		}

		const gasPrice = await this.ethereumCacheHelper.getGasPrice()

		const tokenContract = this.ethereumContract.createTokenContract(
			swap.sourceToken.address,
			swap.sourceWallet.secretKey,
		)
		const transactionId = await this.ethereumContract.transferTokens(
			tokenContract,
			swap.collectorWallet.address,
			new BigNumber(swap.fee),
			swap.sourceToken.decimals,
			gasPrice,
		)

		await this.ethereumBlockchain.waitForTransaction(transactionId, ETH_TOTAL_CONFIRMATIONS)

		await this.swapsService.update(swap.id, { collectorTransactionId: transactionId })

		const balance = new BigNumber(swap.sourceWallet.balance)
			.minus(swap.fee)
			.toFixed(swap.sourceToken.decimals)
		await this.walletsService.update(swap.sourceWallet.id, { balance })

		this.logger.log(`${data.swapId}: Fee transferred`)
	}
}
