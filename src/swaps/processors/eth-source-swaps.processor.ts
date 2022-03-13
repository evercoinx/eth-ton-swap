import { InjectQueue, OnQueueCompleted, OnQueueFailed, Process, Processor } from "@nestjs/bull"
import { CACHE_MANAGER, Inject, Logger } from "@nestjs/common"
import BigNumber from "bignumber.js"
import { Job, Queue } from "bull"
import { Cache } from "cache-manager"
import {
	BlockWithTransactions,
	EthersContract,
	EthersSigner,
	formatUnits,
	id,
	InfuraProvider,
	InjectContractProvider,
	InjectEthersProvider,
	InjectSignerProvider,
	Interface,
	parseUnits,
} from "nestjs-ethers"
import { EventsService } from "src/common/events.service"
import {
	BLOCK_CONFIRMATION_TTL,
	CONFIRM_ETH_BLOCK_JOB,
	CONFIRM_ETH_SWAP_JOB,
	ETH_BLOCK_TRACKING_INTERVAL,
	ETH_CACHE_TTL,
	ETH_SOURCE_SWAPS_QUEUE,
	TON_DESTINATION_SWAPS_QUEUE,
	TOTAL_BLOCK_CONFIRMATIONS,
	TRANSFER_ETH_FEE_JOB,
	TRANSFER_TON_SWAP_JOB,
} from "../constants"
import { ConfirmBlockDto } from "../dto/confirm-block.dto"
import { ConfirmSwapDto } from "../dto/confirm-swap.dto"
import { TransferFeeDto } from "../dto/transfer-fee.dto"
import { TransferSwapDto } from "../dto/transfer-swap.dto"
import { SwapEvent } from "../interfaces/swap-event.interface"
import { TransferEventParams } from "../interfaces/transfer-event-params.interface"
import { Swap, SwapStatus } from "../swap.entity"
import { SwapsService } from "../swaps.service"

@Processor(ETH_SOURCE_SWAPS_QUEUE)
export class EthSourceSwapsProcessor {
	private static readonly cacheKeyPrefix = "eth:"
	private static readonly contractAbi = [
		"function transfer(address to, uint amount) returns (bool)",
		"event Transfer(address indexed from, address indexed to, uint amount)",
	]

	private readonly logger = new Logger(EthSourceSwapsProcessor.name)
	private readonly contractInterface = new Interface(EthSourceSwapsProcessor.contractAbi)

	constructor(
		private readonly swapsService: SwapsService,
		private readonly eventsService: EventsService,
		@Inject(CACHE_MANAGER)
		private readonly cacheManager: Cache,
		@InjectQueue(ETH_SOURCE_SWAPS_QUEUE)
		private readonly sourceSwapsQueue: Queue,
		@InjectQueue(TON_DESTINATION_SWAPS_QUEUE)
		private readonly destinationSwapsQueue: Queue,
		@InjectEthersProvider()
		private readonly infuraProvider: InfuraProvider,
		@InjectSignerProvider()
		private readonly signer: EthersSigner,
		@InjectContractProvider()
		private readonly contract: EthersContract,
	) {}

	@Process(CONFIRM_ETH_SWAP_JOB)
	async confirmEthSwap(job: Job<ConfirmSwapDto>): Promise<SwapStatus> {
		const { data } = job
		this.logger.debug(`Start confirming eth swap ${data.swapId} in block #${data.blockNumber}`)

		let swap = await this.swapsService.findOne(data.swapId)
		if (!swap) {
			this.logger.error(`Swap ${data.swapId} is not found`)
			return SwapStatus.Failed
		}

		if (data.ttl <= 0) {
			await this.swapsService.update(
				{
					id: swap.id,
					status: SwapStatus.Expired,
				},
				swap.sourceToken,
				swap.destinationToken,
			)

			this.logger.error(`Unable to confirm eth swap ${swap.id}: TTL reached ${data.ttl}`)
			return SwapStatus.Expired
		}

		const block = await this.checkBlock(data.blockNumber)

		const logs = await this.infuraProvider.getLogs({
			address: swap.sourceToken.address,
			topics: [id("Transfer(address,address,uint256)")],
			fromBlock: data.blockNumber,
			toBlock: data.blockNumber,
		})

		for (const log of logs) {
			const logDescription = this.contractInterface.parseLog(log)
			if (!logDescription || logDescription.args.length !== 3) {
				continue
			}

			const [fromAddress, toAddress, amount] = logDescription.args as TransferEventParams
			if (this.normalizeHex(toAddress) !== swap.sourceWallet.address) {
				continue
			}

			const transferAmount = formatUnits(amount.toString(), swap.sourceToken.decimals)
			if (!new BigNumber(transferAmount).eq(swap.sourceAmount)) {
				swap = this.recalculateSwap(swap, transferAmount.toString())
				if (!swap) {
					await this.swapsService.update(
						{
							id: swap.id,
							status: SwapStatus.Failed,
						},
						swap.sourceToken,
						swap.destinationToken,
					)

					this.logger.error(
						`Not enough amount to swap tokens: ${transferAmount.toString()} ETH`,
					)
					return SwapStatus.Failed
				}
			}

			let sourceTransactionHash: string
			for (const transaction of block.transactions) {
				if (transaction.from === fromAddress) {
					sourceTransactionHash = transaction.hash
					break
				}
			}

			if (!sourceTransactionHash) {
				await this.swapsService.update(
					{
						id: swap.id,
						status: SwapStatus.Failed,
					},
					swap.sourceToken,
					swap.destinationToken,
				)

				this.logger.error(`Transaction hash for swap ${swap.id} is not found`)
				return SwapStatus.Failed
			}

			await this.swapsService.update(
				{
					id: swap.id,
					sourceAddress: this.normalizeHex(fromAddress),
					sourceAmount: swap.sourceAmount,
					sourceTransactionHash: this.normalizeHex(sourceTransactionHash),
					destinationAmount: swap.destinationAmount,
					fee: swap.fee,
					status: SwapStatus.Confirmed,
				},
				swap.sourceToken,
				swap.destinationToken,
			)

			return SwapStatus.Confirmed
		}

		throw new Error("Transfer not found")
	}

	@OnQueueFailed({ name: CONFIRM_ETH_SWAP_JOB })
	async onConfirmSourceSwapFailed(job: Job<ConfirmSwapDto>, err: Error): Promise<void> {
		const { data } = job
		this.emitEvent(data.swapId, SwapStatus.Pending, 0)
		this.logger.debug(`Swap ${data.swapId} failed. Error: ${err.message}. Retrying...`)

		await this.sourceSwapsQueue.add(
			CONFIRM_ETH_SWAP_JOB,
			{
				swapId: data.swapId,
				ttl: data.ttl - 1,
				blockNumber:
					err.message === "Transfer not found" ? data.blockNumber + 1 : data.blockNumber,
			} as ConfirmSwapDto,
			{
				delay: ETH_BLOCK_TRACKING_INTERVAL,
				priority: 1,
			},
		)
	}

	@OnQueueCompleted({ name: CONFIRM_ETH_SWAP_JOB })
	async onConfirmEthSwapCompleted(
		job: Job<ConfirmSwapDto>,
		resultStatus: SwapStatus,
	): Promise<void> {
		const { data } = job
		if (resultStatus === SwapStatus.Failed || resultStatus === SwapStatus.Expired) {
			this.emitEvent(data.swapId, resultStatus, 0)
			return
		}

		this.emitEvent(data.swapId, SwapStatus.Confirmed, 0)
		this.logger.log(`Swap ${data.swapId} confirmed in block #${data.blockNumber} successfully`)

		await this.sourceSwapsQueue.add(
			CONFIRM_ETH_BLOCK_JOB,
			{
				swapId: data.swapId,
				ttl: BLOCK_CONFIRMATION_TTL,
				blockNumber: data.blockNumber,
				blockConfirmations: 1,
			} as ConfirmBlockDto,
			{
				delay: ETH_BLOCK_TRACKING_INTERVAL,
				priority: 1,
			},
		)
	}

	@Process(CONFIRM_ETH_BLOCK_JOB)
	async confirmEthBlock(job: Job<ConfirmBlockDto>): Promise<SwapStatus> {
		const { data } = job
		this.logger.debug(`Start confirming eth block ${data.blockNumber} for swap ${data.swapId}`)

		const swap = await this.swapsService.findOne(data.swapId)
		if (!swap) {
			this.logger.error(`Swap ${data.swapId} is not found`)
			return SwapStatus.Failed
		}

		if (data.ttl <= 0) {
			await this.swapsService.update(
				{
					id: swap.id,
					status: SwapStatus.Expired,
				},
				swap.sourceToken,
				swap.destinationToken,
			)

			this.logger.error(
				`Unable to confirm eth block ${data.blockNumber} for swap ${swap.id}: TTL reached ${data.ttl}`,
			)
			return SwapStatus.Expired
		}

		await this.checkBlock(data.blockNumber)

		await this.swapsService.update(
			{
				id: swap.id,
				blockConfirmations: data.blockConfirmations,
			},
			swap.sourceToken,
			swap.destinationToken,
		)

		return SwapStatus.Confirmed
	}

	@OnQueueFailed({ name: CONFIRM_ETH_BLOCK_JOB })
	async onConfirmEthBlockFailed(job: Job<ConfirmBlockDto>, err: Error): Promise<void> {
		const { data } = job
		this.emitEvent(data.swapId, SwapStatus.Confirmed, data.blockConfirmations)
		this.logger.debug(`Swap ${data.swapId} failed. Error: ${err.message}. Retrying...`)

		await this.sourceSwapsQueue.add(
			CONFIRM_ETH_BLOCK_JOB,
			{
				swapId: data.swapId,
				ttl: data.ttl - 1,
				blockNumber: data.blockNumber,
				blockConfirmations: data.blockConfirmations,
			} as ConfirmBlockDto,
			{
				delay: ETH_BLOCK_TRACKING_INTERVAL,
				priority: 1,
			},
		)
	}

	@OnQueueCompleted({ name: CONFIRM_ETH_BLOCK_JOB })
	async onConfirmEthBlockCompleted(
		job: Job<ConfirmBlockDto>,
		resultStatus: SwapStatus,
	): Promise<void> {
		const { data } = job
		if (resultStatus === SwapStatus.Failed || resultStatus === SwapStatus.Expired) {
			this.emitEvent(data.swapId, resultStatus, data.blockConfirmations)
			return
		}

		this.emitEvent(data.swapId, SwapStatus.Confirmed, data.blockConfirmations)
		this.logger.log(
			`Swap ${data.swapId} confirmed in block #${data.blockNumber} with count of ${data.blockConfirmations}`,
		)

		if (data.blockConfirmations < TOTAL_BLOCK_CONFIRMATIONS) {
			await this.sourceSwapsQueue.add(
				CONFIRM_ETH_BLOCK_JOB,
				{
					swapId: data.swapId,
					ttl: BLOCK_CONFIRMATION_TTL,
					blockNumber: data.blockNumber + 1,
					blockConfirmations: data.blockConfirmations + 1,
				} as ConfirmBlockDto,
				{
					delay: ETH_BLOCK_TRACKING_INTERVAL,
					priority: 1,
				},
			)
			return
		}

		await this.destinationSwapsQueue.add(
			TRANSFER_TON_SWAP_JOB,
			{
				swapId: data.swapId,
				ttl: BLOCK_CONFIRMATION_TTL,
			} as TransferSwapDto,
			{
				priority: 1,
			},
		)

		await this.sourceSwapsQueue.add(
			TRANSFER_ETH_FEE_JOB,
			{
				swapId: data.swapId,
				ttl: BLOCK_CONFIRMATION_TTL,
			} as TransferFeeDto,
			{
				priority: 3,
			},
		)
	}

	@Process(TRANSFER_ETH_FEE_JOB)
	async transferEthFee(job: Job<TransferFeeDto>): Promise<void> {
		const { data } = job
		this.logger.debug(`Start transferring eth fee for swap ${data.swapId}`)

		const swap = await this.swapsService.findOne(data.swapId)
		if (!swap) {
			this.logger.error(`Swap ${data.swapId} is not found`)
			return
		}

		if (data.ttl <= 0) {
			this.logger.warn(
				`Unable to transfer eth fee for swap ${swap.id}: TTL reached ${data.ttl}`,
			)
			return
		}

		const sourceWallet = this.signer.createWallet(`0x${swap.sourceWallet.secretKey}`)
		const sourceContract = this.contract.create(
			`0x${swap.sourceToken.address}`,
			EthSourceSwapsProcessor.contractAbi,
			sourceWallet,
		)

		const gasPrice = await this.infuraProvider.getGasPrice()
		const tokenAmount = parseUnits(swap.fee, swap.sourceToken.decimals)

		const transaction = await sourceContract.transfer(
			swap.collectorWallet.address,
			tokenAmount,
			{
				gasPrice,
				gasLimit: "100000",
			},
		)

		await this.swapsService.update(
			{
				id: swap.id,
				collectorTransactionHash: this.normalizeHex(transaction.hash),
			},
			swap.sourceToken,
			swap.destinationToken,
		)

		this.logger.log(`Eth fee for swap ${data.swapId} transferred successfully`)
	}

	@OnQueueFailed({ name: TRANSFER_ETH_FEE_JOB })
	async onTransferEthFeeFailed(job: Job<TransferFeeDto>, err: Error): Promise<void> {
		const { data } = job
		this.logger.debug(`Swap ${data.swapId} failed. Error: ${err.message}. Retrying...`)

		await this.sourceSwapsQueue.add(
			TRANSFER_ETH_FEE_JOB,
			{
				swapId: data.swapId,
				ttl: data.ttl - 1,
			} as TransferFeeDto,
			{
				delay: ETH_BLOCK_TRACKING_INTERVAL,
				priority: 3,
			},
		)
	}

	private async checkBlock(blockNumber: number): Promise<BlockWithTransactions> {
		const cacheKey = EthSourceSwapsProcessor.cacheKeyPrefix + blockNumber.toString()
		let block = await this.cacheManager.get<BlockWithTransactions>(cacheKey)
		if (!block) {
			block = await this.infuraProvider.getBlockWithTransactions(blockNumber)
			if (!block) {
				throw new Error("Block not found")
			}
			this.cacheManager.set(cacheKey, block, { ttl: ETH_CACHE_TTL })
		}
		return block
	}

	private recalculateSwap(swap: Swap, transferAmount: string): Swap | undefined {
		const { destinationAmount, fee } = this.swapsService.calculateSwapAmounts(
			transferAmount,
			swap.sourceToken,
			swap.destinationToken,
		)
		if (new BigNumber(destinationAmount).lte(0) || new BigNumber(fee).lte(0)) {
			return
		}

		swap.sourceAmount = transferAmount
		swap.destinationAmount = destinationAmount
		swap.fee = fee
		return swap
	}

	private emitEvent(swapId: string, status: SwapStatus, currentConfirmations: number): void {
		this.eventsService.emit({
			id: swapId,
			status,
			currentConfirmations,
			totalConfirmations: TOTAL_BLOCK_CONFIRMATIONS,
			createdAt: Date.now(),
		} as SwapEvent)
	}

	private normalizeHex(hexStr: string): string {
		return hexStr.startsWith("0x") ? hexStr.slice(2) : hexStr
	}
}
