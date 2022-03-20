import { InjectQueue, OnQueueCompleted, OnQueueFailed, Process, Processor } from "@nestjs/bull"
import { CACHE_MANAGER, Inject, Logger } from "@nestjs/common"
import BigNumber from "bignumber.js"
import { Job, Queue } from "bull"
import { Cache } from "cache-manager"
import {
	EthersContract,
	EthersSigner,
	formatUnits,
	hexlify,
	id,
	InfuraProvider,
	InjectContractProvider,
	InjectEthersProvider,
	InjectSignerProvider,
	Interface,
	parseUnits,
} from "nestjs-ethers"
import { EventsService } from "src/common/events.service"
import { ERC20_TOKEN_TRANSFER_GAS_LIMIT } from "src/fees/contstants"
import {
	BLOCK_CONFIRMATION_TTL,
	CONFIRM_ETH_BLOCK_JOB,
	CONFIRM_ETH_SWAP_JOB,
	ETH_BLOCK_TRACKING_INTERVAL,
	ETH_SOURCE_SWAPS_QUEUE,
	QUEUE_HIGH_PRIORITY,
	QUEUE_LOW_PRIORITY,
	TON_DESTINATION_SWAPS_QUEUE,
	TOTAL_BLOCK_CONFIRMATIONS,
	TRANSFER_ETH_FEE_JOB,
	TRANSFER_TON_SWAP_JOB,
} from "../constants"
import { ConfirmBlockDto } from "../dto/confirm-block.dto"
import { ConfirmSwapDto } from "../dto/confirm-swap.dto"
import { TransferFeeDto } from "../dto/transfer-fee.dto"
import { TransferSwapDto } from "../dto/transfer-swap.dto"
import { TransferEventParams } from "../interfaces/transfer-event-params.interface"
import { SwapStatus } from "../swap.entity"
import { SwapsService } from "../swaps.service"
import { EthBaseSwapsProcessor } from "./eth-base-swaps.processor"

@Processor(ETH_SOURCE_SWAPS_QUEUE)
export class EthSourceSwapsProcessor extends EthBaseSwapsProcessor {
	private readonly logger = new Logger(EthSourceSwapsProcessor.name)
	private readonly contractInterface = new Interface(
		EthSourceSwapsProcessor.erc20TokenContractAbi,
	)

	constructor(
		@Inject(CACHE_MANAGER) cacheManager: Cache,
		@InjectEthersProvider() infuraProvider: InfuraProvider,
		@InjectSignerProvider() private readonly signer: EthersSigner,
		@InjectContractProvider() private readonly contract: EthersContract,
		swapsService: SwapsService,
		eventsService: EventsService,
		@InjectQueue(ETH_SOURCE_SWAPS_QUEUE) private readonly sourceSwapsQueue: Queue,
		@InjectQueue(TON_DESTINATION_SWAPS_QUEUE) private readonly destinationSwapsQueue: Queue,
	) {
		super(cacheManager, "eth:src", infuraProvider, swapsService, eventsService)
	}

	@Process(CONFIRM_ETH_SWAP_JOB)
	async confirmEthSwap(job: Job<ConfirmSwapDto>): Promise<SwapStatus> {
		const { data } = job
		this.logger.debug(`Start confirming eth swap ${data.swapId} in block #${data.blockNumber}`)

		let swap = await this.swapsService.findById(data.swapId)
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

			let sourceTransactionId: string
			for (const transaction of block.transactions) {
				if (transaction.from === fromAddress) {
					sourceTransactionId = transaction.hash
					break
				}
			}

			if (!sourceTransactionId) {
				await this.swapsService.update(
					{
						id: swap.id,
						status: SwapStatus.Failed,
					},
					swap.sourceToken,
					swap.destinationToken,
				)

				this.logger.error(`Transaction id for swap ${swap.id} is not found`)
				return SwapStatus.Failed
			}

			await this.swapsService.update(
				{
					id: swap.id,
					sourceAddress: this.normalizeHex(fromAddress),
					sourceAmount: swap.sourceAmount,
					sourceTransactionId: this.normalizeHex(sourceTransactionId),
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
				blockNumber: data.blockNumber + 1,
				blockConfirmations: 1,
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
		this.logger.debug(`Start confirming eth block ${data.blockNumber} for swap ${data.swapId}`)

		const swap = await this.swapsService.findById(data.swapId)
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
				status: SwapStatus.Confirmed,
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
					priority: QUEUE_HIGH_PRIORITY,
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
				priority: QUEUE_HIGH_PRIORITY,
			},
		)
	}

	@Process(TRANSFER_ETH_FEE_JOB)
	async transferEthFee(job: Job<TransferFeeDto>): Promise<void> {
		const { data } = job
		this.logger.debug(`Start transferring eth fee for swap ${data.swapId}`)

		const swap = await this.swapsService.findById(data.swapId)
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
			EthSourceSwapsProcessor.erc20TokenContractAbi,
			sourceWallet,
		)

		const gasPrice = await this.infuraProvider.getGasPrice()
		const tokenAmount = parseUnits(swap.fee, swap.sourceToken.decimals)

		const transaction = await sourceContract.transfer(
			swap.collectorWallet.address,
			tokenAmount,
			{
				gasPrice: hexlify(gasPrice),
				gasLimit: hexlify(ERC20_TOKEN_TRANSFER_GAS_LIMIT),
			},
		)

		await this.swapsService.update(
			{
				id: swap.id,
				collectorTransactionId: this.normalizeHex(transaction.hash),
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
				priority: QUEUE_LOW_PRIORITY,
			},
		)
	}
}
