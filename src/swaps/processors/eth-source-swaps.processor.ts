import { InjectQueue, OnQueueCompleted, OnQueueFailed, Process, Processor } from "@nestjs/bull"
import { CACHE_MANAGER, Inject, Logger } from "@nestjs/common"
import BigNumber from "bignumber.js"
import { Job, Queue } from "bull"
import { Cache } from "cache-manager"
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
	ETH_TOTAL_SWAP_CONFIRMATIONS,
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
import { SwapsService } from "../swaps.service"
import { EthBaseSwapsProcessor } from "./eth-base-swaps.processor"

@Processor(ETH_SOURCE_SWAPS_QUEUE)
export class EthSourceSwapsProcessor extends EthBaseSwapsProcessor {
	private readonly logger = new Logger(EthSourceSwapsProcessor.name)

	constructor(
		@Inject(CACHE_MANAGER) cacheManager: Cache,
		protected readonly ethereumBlockchain: EthereumBlockchainProvider,
		protected readonly ethereumContract: EthereumConractProvider,
		protected readonly eventsService: EventsService,
		private readonly swapsService: SwapsService,
		private readonly walletsService: WalletsService,
		@InjectQueue(ETH_SOURCE_SWAPS_QUEUE) private readonly sourceSwapsQueue: Queue,
		@InjectQueue(TON_DESTINATION_SWAPS_QUEUE) private readonly destinationSwapsQueue: Queue,
	) {
		super(cacheManager, "eth:src", ethereumBlockchain)
	}

	@Process(CONFIRM_ETH_TRANSFER_JOB)
	async confirmEthTransfer(job: Job<ConfirmTransferDto>): Promise<[SwapStatus, string?]> {
		const { data } = job
		this.logger.debug(`${data.swapId}: Start confirming transfer in block ${data.blockNumber}`)

		let swap = await this.swapsService.findById(data.swapId)
		if (!swap) {
			this.logger.error(`${data.swapId}: Swap not found`)
			return [SwapStatus.Failed, undefined]
		}

		if (swap.status === SwapStatus.Canceled) {
			await this.walletsService.update(swap.sourceWallet.id, { inUse: false })

			this.logger.warn(`${swap.id}: Swap canceled`)
			return [SwapStatus.Canceled, undefined]
		}

		if (swap.expiresAt < new Date()) {
			await this.swapsService.update(swap.id, { status: SwapStatus.Expired })

			await this.walletsService.update(swap.sourceWallet.id, { inUse: false })

			this.logger.error(`${swap.id}: Swap expired`)
			return [SwapStatus.Expired, undefined]
		}

		const currentBlock = await this.getBlockWithTransactions(data.blockNumber)

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
				} catch (err: unknown) {
					await this.swapsService.update(swap.id, { status: SwapStatus.Failed })

					await this.walletsService.update(swap.sourceWallet.id, { inUse: false })

					this.logger.error(`${swap.id}: Swap not recalculated: ${err}`)
					return [SwapStatus.Failed, undefined]
				}
			}

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

			return [SwapStatus.Confirmed, transferLog.transactionId]
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
		result: [SwapStatus, string?],
	): Promise<void> {
		const { data } = job
		if (getNonProcessableSwapStatuses().includes(result[0])) {
			this.eventsService.emit({
				id: data.swapId,
				status: result[0],
				currentConfirmations: 0,
				totalConfirmations: ETH_TOTAL_SWAP_CONFIRMATIONS,
				createdAt: Date.now(),
			} as SwapEvent)
			return
		}

		this.eventsService.emit({
			id: data.swapId,
			status: SwapStatus.Confirmed,
			currentConfirmations: 1,
			totalConfirmations: ETH_TOTAL_SWAP_CONFIRMATIONS,
			createdAt: Date.now(),
		} as SwapEvent)
		this.logger.log(`${data.swapId}: Transfer confirmed in block ${data.blockNumber}`)

		await this.sourceSwapsQueue.add(
			WAIT_FOR_ETH_TRANSFER_CONFIRMATION,
			{
				swapId: data.swapId,
				transactionId: result[1],
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
	): Promise<SwapStatus> {
		const { data } = job
		this.logger.debug(
			`${data.swapId}: Start waiting for ${data.confirmations} transfer confirmation`,
		)

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

		await this.ethereumBlockchain.waitForTransaction(data.transactionId, data.confirmations)

		await this.swapsService.update(swap.id, {
			confirmations: data.confirmations,
			status: SwapStatus.Confirmed,
		})

		return SwapStatus.Confirmed
	}

	@OnQueueCompleted({ name: WAIT_FOR_ETH_TRANSFER_CONFIRMATION })
	async onWaitForEthTransferConfirmationCompleted(
		job: Job<WaitForTransferConfirmationDto>,
		result: SwapStatus,
	): Promise<void> {
		const { data } = job
		if (getNonProcessableSwapStatuses().includes(result)) {
			this.eventsService.emit({
				id: data.swapId,
				status: result,
				currentConfirmations: data.confirmations,
				totalConfirmations: ETH_TOTAL_SWAP_CONFIRMATIONS,
				createdAt: Date.now(),
			} as SwapEvent)
			return
		}

		this.eventsService.emit({
			id: data.swapId,
			status: SwapStatus.Confirmed,
			currentConfirmations: data.confirmations,
			totalConfirmations: ETH_TOTAL_SWAP_CONFIRMATIONS,
			createdAt: Date.now(),
		} as SwapEvent)
		this.logger.log(`${data.swapId}: Transfer confirmed ${data.confirmations} times`)

		if (data.confirmations < ETH_TOTAL_SWAP_CONFIRMATIONS) {
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

		const gasPrice = await this.getGasPrice()

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

		await this.ethereumBlockchain.waitForTransaction(
			transactionId,
			ETH_TOTAL_SWAP_CONFIRMATIONS,
		)

		await this.swapsService.update(swap.id, { collectorTransactionId: transactionId })

		const balance = new BigNumber(swap.sourceWallet.balance)
			.minus(swap.fee)
			.toFixed(swap.sourceToken.decimals)
		await this.walletsService.update(swap.sourceWallet.id, { balance })

		this.logger.log(`${data.swapId}: Fee transferred`)
	}
}
