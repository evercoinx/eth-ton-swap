import { InjectQueue, OnQueueCompleted, OnQueueFailed, Process, Processor } from "@nestjs/bull"
import { CACHE_MANAGER, Inject, Logger } from "@nestjs/common"
import BigNumber from "bignumber.js"
import { Job, Queue } from "bull"
import { Cache } from "cache-manager"
import { EventsService } from "src/common/events.service"
import { EthereumBlockchainProvider } from "src/ethereum/ethereum-blockchain.provider"
import { EthereumConractProvider } from "src/ethereum/ethereum-contract.provider"
import { WalletsService } from "src/wallets/wallets.service"
import {
	CONFIRM_ETH_BLOCK_JOB,
	CONFIRM_ETH_SWAP_JOB,
	ETH_BLOCK_TRACKING_INTERVAL,
	ETH_SOURCE_SWAPS_QUEUE,
	QUEUE_HIGH_PRIORITY,
	QUEUE_LOW_PRIORITY,
	TON_DESTINATION_SWAPS_QUEUE,
	TOTAL_CONFIRMATIONS,
	TRANSFER_ETH_FEE_JOB,
	TRANSFER_TON_SWAP_JOB,
} from "../constants"
import { ConfirmBlockDto } from "../dto/confirm-block.dto"
import { ConfirmSwapDto } from "../dto/confirm-swap.dto"
import { TransferFeeDto } from "../dto/transfer-fee.dto"
import { TransferSwapDto } from "../dto/transfer-swap.dto"
import { SwapStatus } from "../swap.entity"
import { SwapsService } from "../swaps.service"
import { EthBaseSwapsProcessor } from "./eth-base-swaps.processor"

@Processor(ETH_SOURCE_SWAPS_QUEUE)
export class EthSourceSwapsProcessor extends EthBaseSwapsProcessor {
	private readonly logger = new Logger(EthSourceSwapsProcessor.name)

	constructor(
		@Inject(CACHE_MANAGER) cacheManager: Cache,
		protected readonly ethereumBlockchain: EthereumBlockchainProvider,
		protected readonly ethereumContract: EthereumConractProvider,
		protected readonly swapsService: SwapsService,
		protected readonly eventsService: EventsService,
		protected readonly walletsService: WalletsService,
		@InjectQueue(ETH_SOURCE_SWAPS_QUEUE) private readonly sourceSwapsQueue: Queue,
		@InjectQueue(TON_DESTINATION_SWAPS_QUEUE) private readonly destinationSwapsQueue: Queue,
	) {
		super(
			cacheManager,
			"eth:src",
			ethereumBlockchain,
			swapsService,
			eventsService,
			walletsService,
		)
	}

	@Process(CONFIRM_ETH_SWAP_JOB)
	async confirmEthSwap(job: Job<ConfirmSwapDto>): Promise<SwapStatus> {
		const { data } = job
		this.logger.debug(`${data.swapId}: Start confirming swap by block ${data.blockNumber}`)

		let swap = await this.swapsService.findById(data.swapId)
		if (!swap) {
			this.logger.error(`${data.swapId}: Swap not found`)
			return SwapStatus.Failed
		}

		if (swap.status === SwapStatus.Canceled) {
			this.logger.warn(`${swap.id}: Swap canceled`)
			return SwapStatus.Canceled
		}

		if (swap.expiresAt < new Date()) {
			await this.swapsService.update(swap.id, { status: SwapStatus.Expired })

			this.logger.error(`${swap.id}: Swap expired`)
			return SwapStatus.Expired
		}

		const block = await this.getBlockWithTransactions(data.blockNumber)

		const logs = await this.ethereumBlockchain.getLogs(swap.sourceToken.address, block.number)

		for (const log of logs) {
			const transferLog = this.ethereumContract.matchTransferLog(
				log,
				swap.sourceWallet.address,
				swap.sourceToken.decimals,
			)
			if (!transferLog) {
				continue
			}

			if (!transferLog.amount.eq(swap.sourceAmount)) {
				try {
					swap = this.recalculateSwap(swap, transferLog.amount)
				} catch (err: unknown) {
					await this.swapsService.update(swap.id, { status: SwapStatus.Failed })

					this.logger.error(`${swap.id}: Swap not recalculated: ${err}`)
					return SwapStatus.Failed
				}
			}

			const transactions = block.transactions.filter(
				({ from }) => from === transferLog.sourceAddress,
			)
			if (!transactions.length) {
				await this.swapsService.update(swap.id, { status: SwapStatus.Failed })

				this.logger.error(`${swap.id}: Transaction id not found in block ${block.number}`)
				return SwapStatus.Failed
			}

			await this.swapsService.update(
				swap.id,
				{
					sourceAddress: this.ethereumBlockchain.normalizeAddress(
						transferLog.sourceAddress,
					),
					sourceAmount: swap.sourceAmount,
					sourceTransactionId: transactions[0]?.hash.replace(/^0x/, ""),
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

		throw new Error("Transfer not found")
	}

	@OnQueueFailed({ name: CONFIRM_ETH_SWAP_JOB })
	async onConfirmSourceSwapFailed(job: Job<ConfirmSwapDto>, err: Error): Promise<void> {
		const { data } = job
		this.emitEvent(data.swapId, SwapStatus.Pending, 0)
		this.logger.debug(`${data.swapId}: ${err.message}: Retrying...`)

		await this.sourceSwapsQueue.add(
			CONFIRM_ETH_SWAP_JOB,
			{
				swapId: data.swapId,
				blockNumber:
					err.message === "Transfer not found" ? data.blockNumber + 1 : data.blockNumber,
			} as ConfirmSwapDto,
			{
				delay: ETH_BLOCK_TRACKING_INTERVAL,
				priority: QUEUE_HIGH_PRIORITY,
			},
		)
	}

	@OnQueueCompleted({ name: CONFIRM_ETH_SWAP_JOB })
	async onConfirmEthSwapCompleted(
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
			CONFIRM_ETH_BLOCK_JOB,
			{
				swapId: data.swapId,
				blockNumber: data.blockNumber + 1,
				confirmations: 2,
			} as ConfirmBlockDto,
			{
				delay: ETH_BLOCK_TRACKING_INTERVAL,
				priority: QUEUE_HIGH_PRIORITY,
			},
		)
	}

	@Process(CONFIRM_ETH_BLOCK_JOB)
	async confirmEthBlock(job: Job<ConfirmBlockDto>): Promise<SwapStatus> {
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

		await this.getBlockWithTransactions(data.blockNumber)

		await this.swapsService.update(swap.id, {
			confirmations: data.confirmations,
			status: SwapStatus.Confirmed,
		})

		return SwapStatus.Confirmed
	}

	@OnQueueFailed({ name: CONFIRM_ETH_BLOCK_JOB })
	async onConfirmEthBlockFailed(job: Job<ConfirmBlockDto>, err: Error): Promise<void> {
		const { data } = job
		this.emitEvent(data.swapId, SwapStatus.Confirmed, data.confirmations)
		this.logger.debug(`${data.swapId}: ${err.message}: Retrying...`)

		await this.sourceSwapsQueue.add(
			CONFIRM_ETH_BLOCK_JOB,
			{
				swapId: data.swapId,
				blockNumber: data.blockNumber,
				confirmations: data.confirmations,
			} as ConfirmBlockDto,
			{
				delay: ETH_BLOCK_TRACKING_INTERVAL,
				priority: QUEUE_HIGH_PRIORITY,
			},
		)
	}

	@OnQueueCompleted({ name: CONFIRM_ETH_BLOCK_JOB })
	async onConfirmEthBlockCompleted(
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
				CONFIRM_ETH_BLOCK_JOB,
				{
					swapId: data.swapId,
					blockNumber: data.blockNumber + 1,
					confirmations: data.confirmations + 1,
				} as ConfirmBlockDto,
				{
					delay: ETH_BLOCK_TRACKING_INTERVAL,
					priority: QUEUE_HIGH_PRIORITY,
				},
			)
			return
		}

		await this.destinationSwapsQueue.add(
			TRANSFER_TON_SWAP_JOB,
			{ swapId: data.swapId } as TransferSwapDto,
			{ priority: QUEUE_HIGH_PRIORITY },
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

		if (swap.expiresAt < new Date()) {
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
		if (!transactionId) {
			this.logger.warn(`${swap.id}: Transaction id not detected during fee transfer`)
			return
		}

		await this.swapsService.update(swap.id, { collectorTransactionId: transactionId })

		this.logger.log(`${data.swapId}: Fee transferred`)
	}

	@OnQueueFailed({ name: TRANSFER_ETH_FEE_JOB })
	async onTransferEthFeeFailed(job: Job<TransferFeeDto>, err: Error): Promise<void> {
		const { data } = job
		this.logger.debug(`${data.swapId}: ${err.message}: Retrying...`)

		await this.sourceSwapsQueue.add(
			TRANSFER_ETH_FEE_JOB,
			{ swapId: data.swapId } as TransferFeeDto,
			{
				delay: ETH_BLOCK_TRACKING_INTERVAL,
				priority: QUEUE_LOW_PRIORITY,
			},
		)
	}
}
