import { InjectQueue, OnQueueCompleted, OnQueueFailed, Process, Processor } from "@nestjs/bull"
import { CACHE_MANAGER, Inject, Logger } from "@nestjs/common"
import BigNumber from "bignumber.js"
import { Job, Queue } from "bull"
import { Cache } from "cache-manager"
import {
	BigNumber as BN,
	BlockWithTransactions,
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
	Log,
	parseUnits,
} from "nestjs-ethers"
import { ERC20_TOKEN_CONTRACT_ABI, ERC20_TOKEN_TRANSFER_GAS_LIMIT } from "src/common/constants"
import { EventsService } from "src/common/events.service"
import {
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
import { Swap, SwapStatus } from "../swap.entity"
import { SwapsService } from "../swaps.service"
import { EthBaseSwapsProcessor } from "./eth-base-swaps.processor"

@Processor(ETH_SOURCE_SWAPS_QUEUE)
export class EthSourceSwapsProcessor extends EthBaseSwapsProcessor {
	private readonly logger = new Logger(EthSourceSwapsProcessor.name)
	private readonly contractInterface = new Interface(ERC20_TOKEN_CONTRACT_ABI)

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
		this.logger.debug(`${data.swapId}: Start confirming swap in block ${data.blockNumber}`)

		const swap = await this.swapsService.findById(data.swapId)
		if (!swap) {
			this.logger.error(`${data.swapId}: Swap not found`)
			return SwapStatus.Failed
		}

		if (swap.status === SwapStatus.Canceled) {
			this.logger.warn(`${swap.id}: Swap canceled`)
			return SwapStatus.Canceled
		}

		if (swap.expiresAt < new Date()) {
			await this.swapsService.update(
				{
					id: swap.id,
					status: SwapStatus.Expired,
				},
				swap.sourceToken,
				swap.destinationToken,
			)

			this.logger.error(`${swap.id}: Swap expired`)
			return SwapStatus.Expired
		}

		const block = await this.getBlock(data.blockNumber)

		const logs = await this.infuraProvider.getLogs({
			address: swap.sourceToken.address,
			topics: [id("Transfer(address,address,uint256)")],
			fromBlock: data.blockNumber,
			toBlock: data.blockNumber,
		})

		for (const log of logs) {
			const swapStatus = await this.findTransfer(swap, block, log)
			if (swapStatus) {
				return swapStatus
			}
		}
		throw new Error("Transfer not found")
	}

	private async findTransfer(
		swap: Swap,
		block: BlockWithTransactions,
		log: Log,
	): Promise<SwapStatus | undefined> {
		const logDescription = this.contractInterface.parseLog(log)
		if (!logDescription || logDescription.args.length !== 3) {
			return
		}

		const [fromAddress, toAddress, amount] = logDescription.args as [string, string, BN]
		if (this.normalizeHex(toAddress) !== swap.sourceWallet.address) {
			return
		}

		const transferAmount = formatUnits(amount, swap.sourceToken.decimals)
		if (!new BigNumber(transferAmount).eq(swap.sourceAmount)) {
			try {
				swap = this.recalculateSwap(swap, transferAmount.toString())
			} catch (err: unknown) {
				await this.swapsService.update(
					{
						id: swap.id,
						status: SwapStatus.Failed,
					},
					swap.sourceToken,
					swap.destinationToken,
				)

				this.logger.error(`${swap.id}: Swap not recalculated: ${err}`)
				return SwapStatus.Failed
			}
		}

		const sourceTransactions = block.transactions.filter(({ from }) => from === fromAddress)
		if (!sourceTransactions.length) {
			await this.swapsService.update(
				{
					id: swap.id,
					status: SwapStatus.Failed,
				},
				swap.sourceToken,
				swap.destinationToken,
			)

			this.logger.error(`${swap.id}: Transaction id not found in block ${block.number}`)
			return SwapStatus.Failed
		}

		await this.swapsService.update(
			{
				id: swap.id,
				sourceAddress: this.normalizeHex(fromAddress),
				sourceAmount: swap.sourceAmount,
				sourceTransactionId: this.normalizeHex(sourceTransactions[0].hash),
				destinationAmount: swap.destinationAmount,
				fee: swap.fee,
				status: SwapStatus.Confirmed,
			},
			swap.sourceToken,
			swap.destinationToken,
		)

		return SwapStatus.Confirmed
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

		this.emitEvent(data.swapId, SwapStatus.Confirmed, 0)
		this.logger.log(`${data.swapId}: Swap confirmed in block ${data.blockNumber}`)

		await this.sourceSwapsQueue.add(
			CONFIRM_ETH_BLOCK_JOB,
			{
				swapId: data.swapId,
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
		this.logger.debug(`${data.swapId}: Start confirming block ${data.blockNumber}`)

		const swap = await this.swapsService.findById(data.swapId)
		if (!swap) {
			this.logger.error(`${data.swapId}: Swap not found`)
			return SwapStatus.Failed
		}

		if (swap.expiresAt < new Date()) {
			await this.swapsService.update(
				{
					id: swap.id,
					status: SwapStatus.Expired,
				},
				swap.sourceToken,
				swap.destinationToken,
			)

			this.logger.error(`${swap.id}: Swap expired`)
			return SwapStatus.Expired
		}

		await this.getBlock(data.blockNumber)

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
		this.logger.debug(`${data.swapId}: ${err.message}: Retrying...`)

		await this.sourceSwapsQueue.add(
			CONFIRM_ETH_BLOCK_JOB,
			{
				swapId: data.swapId,
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
		if (!this.isSwapProcessable(resultStatus)) {
			this.emitEvent(data.swapId, resultStatus, data.blockConfirmations)
			return
		}

		this.emitEvent(data.swapId, SwapStatus.Confirmed, data.blockConfirmations)
		this.logger.log(
			`${data.swapId}: Block ${data.blockNumber} confirmed ${data.blockConfirmations} times`,
		)

		if (data.blockConfirmations < TOTAL_BLOCK_CONFIRMATIONS) {
			await this.sourceSwapsQueue.add(
				CONFIRM_ETH_BLOCK_JOB,
				{
					swapId: data.swapId,
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
			} as TransferSwapDto,
			{
				priority: QUEUE_HIGH_PRIORITY,
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

		if (swap.expiresAt < new Date()) {
			this.logger.warn(`${swap.id}: Swap expired`)
			return
		}

		const walletSigner = this.signer.createWallet(`0x${swap.sourceWallet.secretKey}`)
		const sourceContract = this.contract.create(
			`0x${swap.sourceToken.address}`,
			ERC20_TOKEN_CONTRACT_ABI,
			walletSigner,
		)

		const gasPrice = await this.getGasPrice()
		const tokenAmount = parseUnits(swap.fee, swap.sourceToken.decimals)

		const transaction = await sourceContract.transfer(
			swap.collectorWallet.address,
			tokenAmount,
			{
				gasPrice: hexlify(gasPrice.toNumber()),
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

		this.logger.log(`${data.swapId}: Fee transferred`)
	}

	@OnQueueFailed({ name: TRANSFER_ETH_FEE_JOB })
	async onTransferEthFeeFailed(job: Job<TransferFeeDto>, err: Error): Promise<void> {
		const { data } = job
		this.logger.debug(`${data.swapId}: ${err.message}: Retrying...`)

		await this.sourceSwapsQueue.add(
			TRANSFER_ETH_FEE_JOB,
			{
				swapId: data.swapId,
			} as TransferFeeDto,
			{
				delay: ETH_BLOCK_TRACKING_INTERVAL,
				priority: QUEUE_LOW_PRIORITY,
			},
		)
	}
}
