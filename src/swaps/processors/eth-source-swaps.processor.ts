import { InjectQueue, OnQueueCompleted, OnQueueFailed, Process, Processor } from "@nestjs/bull"
import { CACHE_MANAGER, Inject, Logger } from "@nestjs/common"
import BigNumber from "bignumber.js"
import { Job, Queue } from "bull"
import { Cache } from "cache-manager"
import { QUEUE_HIGH_PRIORITY, QUEUE_LOW_PRIORITY } from "src/common/constants"
import { EventsService } from "src/common/events.service"
import { ETH_BLOCK_TRACKING_INTERVAL } from "src/ethereum/constants"
import { EthereumBlockchainProvider } from "src/ethereum/ethereum-blockchain.provider"
import { EthereumConractProvider } from "src/ethereum/ethereum-contract.provider"
import { WalletsService } from "src/wallets/wallets.service"
import {
	CONFIRM_ETH_BLOCK_JOB,
	CONFIRM_ETH_TRANSFER_JOB,
	ETH_SOURCE_SWAPS_QUEUE,
	MINT_TON_JETTONS_JOB,
	POST_SWAP_EXPIRATION_INTERVAL,
	TON_DESTINATION_SWAPS_QUEUE,
	TOTAL_SWAP_CONFIRMATIONS,
	TRANSFER_ETH_FEE_JOB,
} from "../constants"
import { ConfirmBlockDto } from "../dto/confirm-block.dto"
import { ConfirmTransferDto } from "../dto/confirm-transfer.dto"
import { MintJettonsDto } from "../dto/mint-jettons.dto"
import { TransferFeeDto } from "../dto/transfer-fee.dto"
import { SwapStatus } from "../enums/swap-status.enum"
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

	@Process(CONFIRM_ETH_TRANSFER_JOB)
	async confirmEthTransfer(job: Job<ConfirmTransferDto>): Promise<SwapStatus> {
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
			await this.swapsService.update(swap.id, {
				status: SwapStatus.Expired,
			})

			await this.walletsService.update(swap.sourceWallet.id, { inUse: false })

			this.logger.error(`${swap.id}: Swap expired`)
			return SwapStatus.Expired
		}

		const currentBlock = await this.getBlockWithTransactions(data.blockNumber)

		const previousBlock = await this.getBlockWithTransactions(data.blockNumber - 1)

		const logs = await this.ethereumBlockchain.getLogs(
			swap.sourceToken.address,
			currentBlock.number - 2,
			currentBlock.number,
		)

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
					swap = this.swapsService.recalculateSwap(swap, transferLog.amount)
				} catch (err: unknown) {
					await this.swapsService.update(swap.id, { status: SwapStatus.Failed })

					await this.walletsService.update(swap.sourceWallet.id, { inUse: false })

					this.logger.error(`${swap.id}: Swap not recalculated: ${err}`)
					return SwapStatus.Failed
				}
			}

			const combinedTransactions = previousBlock.transactions.concat(
				currentBlock.transactions,
			)

			const transactions = combinedTransactions.filter(
				({ from }) => from === transferLog.sourceAddress,
			)
			if (!transactions.length) {
				await this.swapsService.update(swap.id, { status: SwapStatus.Failed })

				await this.walletsService.update(swap.sourceWallet.id, { inUse: false })

				this.logger.error(`${swap.id}: Transaction not found while confirming transfer`)
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

			const balance = new BigNumber(swap.sourceWallet.balance)
				.plus(swap.sourceAmount)
				.toFixed(swap.sourceToken.decimals)

			await this.walletsService.update(swap.sourceWallet.id, {
				balance,
				inUse: false,
			})

			return SwapStatus.Confirmed
		}

		throw new Error("Transfer not found")
	}

	@OnQueueFailed({ name: CONFIRM_ETH_TRANSFER_JOB })
	async onConfirmEthTransferFailed(job: Job<ConfirmTransferDto>, err: Error): Promise<void> {
		const { data } = job
		this.emitEvent(data.swapId, SwapStatus.Pending, 0)
		this.logger.debug(`${data.swapId}: ${err.message}: Retrying...`)

		await this.sourceSwapsQueue.add(
			CONFIRM_ETH_TRANSFER_JOB,
			{
				swapId: data.swapId,
				blockNumber:
					err.message === "Transfer not found" ? data.blockNumber + 1 : data.blockNumber,
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
			`${data.swapId}: Transfer confirmed ${data.confirmations} times with block ${data.blockNumber}`,
		)

		if (data.confirmations < TOTAL_SWAP_CONFIRMATIONS) {
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
			MINT_TON_JETTONS_JOB,
			{ swapId: data.swapId } as MintJettonsDto,
			{ priority: QUEUE_HIGH_PRIORITY },
		)
	}

	@Process(TRANSFER_ETH_FEE_JOB)
	async transferEthFee(job: Job<TransferFeeDto>): Promise<void> {
		const { data } = job
		this.logger.debug(`${data.swapId}: Start transferring fee`)

		const swap = await this.swapsService.findById(data.swapId)
		if (!swap) {
			this.logger.warn(`${data.swapId}: Swap not found`)
			return
		}

		const postSwapExpiresAt = new Date(swap.expiresAt.getTime() + POST_SWAP_EXPIRATION_INTERVAL)
		if (postSwapExpiresAt < new Date()) {
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
			this.logger.warn(`${swap.id}: Transaction id not detected`)
			return
		}

		const balance = new BigNumber(swap.sourceWallet.balance)
			.minus(swap.fee)
			.toFixed(swap.sourceToken.decimals)

		await this.walletsService.update(swap.sourceWallet.id, { balance })

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
