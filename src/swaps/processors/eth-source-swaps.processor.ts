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
	CONFIRM_SOURCE_BLOCK_JOB,
	CONFIRM_SOURCE_SWAP_JOB,
	ETH_BLOCK_TRACKING_INTERVAL,
	ETH_CACHE_TTL,
	ETH_SOURCE_SWAPS_QUEUE,
	TON_DESTINATION_SWAPS_QUEUE,
	TOTAL_BLOCK_CONFIRMATIONS,
	TRANSFER_DESTINATION_SWAP_JOB,
	TRANSFER_SOURCE_FEE_JOB,
} from "../constants"
import { ConfirmBlockDto } from "../dto/confirm-block.dto"
import { ConfirmSourceSwapDto } from "../dto/confirm-source-swap.dto"
import { TransferSourceFeeDto } from "../dto/transfer-source-fee.dto"
import { SwapEvent } from "../interfaces/swap-event.interface"
import { TransferEventParams } from "../interfaces/transfer-event-params.interface"
import { Swap, SwapStatus } from "../swap.entity"
import { SwapsService } from "../swaps.service"

@Processor(ETH_SOURCE_SWAPS_QUEUE)
export class EthSourceSwapsProcessor {
	private readonly logger = new Logger(EthSourceSwapsProcessor.name)
	private readonly contractInterface: Interface

	private static readonly tokenContractAbi = [
		"function balanceOf(address owner) view returns (uint256)",
		"function decimals() view returns (uint8)",
		"function symbol() view returns (string)",
		"function transfer(address to, uint amount) returns (bool)",
		"event Transfer(address indexed from, address indexed to, uint amount)",
	]

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
	) {
		this.contractInterface = new Interface(EthSourceSwapsProcessor.tokenContractAbi)
	}

	@Process(CONFIRM_SOURCE_SWAP_JOB)
	async confirmSourceSwap(job: Job<ConfirmSourceSwapDto>): Promise<SwapStatus> {
		try {
			const { data } = job
			this.logger.debug(
				`Start confirming source swap ${data.swapId} in block #${data.blockNumber}`,
			)

			let swap = await this.swapsService.findOne(data.swapId)
			if (!swap) {
				this.logger.error(`Swap ${data.swapId} is not found`)
				return SwapStatus.Failed
			}

			if (swap.status !== SwapStatus.Pending) {
				await this.rejectSwap(
					swap,
					`Swap ${data.swapId} should be in pending status: skipped`,
					SwapStatus.Failed,
				)
				return SwapStatus.Failed
			}

			if (data.ttl <= 0) {
				await this.rejectSwap(swap, `TTL reached ${data.ttl}`, SwapStatus.Expired)
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
						await this.rejectSwap(
							swap,
							`Not enough amount to swap tokens: ${transferAmount.toString()} ETH`,
							SwapStatus.Failed,
						)
						return SwapStatus.Failed
					}
				}

				const sourceTransactionHashes = block.transactions
					.filter((transaction) => transaction.from === fromAddress)
					.map((transaction) => this.normalizeHex(transaction.hash))

				if (!sourceTransactionHashes.length) {
					await this.rejectSwap(
						swap,
						`Swap transaction hash is not found`,
						SwapStatus.Failed,
					)
					return SwapStatus.Failed
				}

				await this.swapsService.update(
					{
						id: swap.id,
						sourceAddress: this.normalizeHex(fromAddress),
						sourceAmount: swap.sourceAmount,
						sourceTransactionHash: sourceTransactionHashes[0],
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
		} catch (err: unknown) {
			this.logger.debug(err)
			throw err
		}
	}

	@OnQueueFailed({ name: CONFIRM_SOURCE_SWAP_JOB })
	async onConfirmSourceSwapFailed(job: Job<ConfirmSourceSwapDto>, err: Error): Promise<void> {
		const { data } = job
		if (err.message === "Transfer not found") {
			data.blockNumber += 1
		}
		data.ttl -= 1

		this.emitEvent(data.swapId, SwapStatus.Pending)

		await this.sourceSwapsQueue.add(CONFIRM_SOURCE_SWAP_JOB, data, {
			delay: ETH_BLOCK_TRACKING_INTERVAL,
			priority: 1,
		})
	}

	@OnQueueCompleted({ name: CONFIRM_SOURCE_SWAP_JOB })
	async onConfirmSourceSwapCompleted(
		job: Job<ConfirmSourceSwapDto>,
		resultStatus: SwapStatus,
	): Promise<void> {
		const { data } = job
		if (resultStatus !== SwapStatus.Confirmed) {
			this.emitEvent(data.swapId, resultStatus)
			return
		}

		this.emitEvent(data.swapId, SwapStatus.Confirmed)
		this.logger.log(`Swap ${data.swapId} confirmed in block #${data.blockNumber} successfully`)

		const jobData: ConfirmBlockDto = {
			swapId: data.swapId,
			blockNumber: data.blockNumber,
			ttl: BLOCK_CONFIRMATION_TTL,
			blockConfirmations: 0,
		}
		await this.sourceSwapsQueue.add(CONFIRM_SOURCE_BLOCK_JOB, jobData, {
			delay: ETH_BLOCK_TRACKING_INTERVAL,
			priority: 1,
		})
	}

	@Process(CONFIRM_SOURCE_BLOCK_JOB)
	async confirmBlock(job: Job<ConfirmBlockDto>): Promise<boolean | undefined> {
		try {
			const { data } = job
			this.logger.debug(
				`Start confirming source swap ${data.swapId} in block #${data.blockNumber}`,
			)

			const swap = await this.swapsService.findOne(data.swapId)
			if (!swap) {
				this.logger.error(`Swap ${data.swapId} is not found`)
				return
			}

			if (swap.status !== SwapStatus.Confirmed) {
				await this.rejectSwap(
					swap,
					`Swap ${data.swapId} should be in confirmed status: skipped`,
					SwapStatus.Failed,
				)
				return
			}

			if (data.ttl <= 0) {
				await this.rejectSwap(swap, `TTL reached ${data.ttl}`, SwapStatus.Expired)
				return
			}

			await this.checkBlock(data.blockNumber)

			const blockConfirmations = swap.blockConfirmations + 1
			const swapFullyConfirmed = blockConfirmations === TOTAL_BLOCK_CONFIRMATIONS

			await this.swapsService.update(
				{
					id: swap.id,
					sourceAddress: swap.sourceAddress,
					sourceAmount: swap.sourceAmount,
					sourceTransactionHash: swap.sourceTransactionHash,
					destinationAmount: swap.destinationAmount,
					fee: swap.fee,
					status: SwapStatus.Confirmed,
					blockConfirmations,
				},
				swap.sourceToken,
				swap.destinationToken,
			)

			this.logger.log(
				`Swap ${data.swapId} ${swapFullyConfirmed ? "fully" : ""} confirmed in block #${
					data.blockNumber
				} with count of ${blockConfirmations}`,
			)
			return swapFullyConfirmed
		} catch (err: unknown) {
			this.logger.debug(err)
			throw err
		}
	}

	@OnQueueFailed({ name: CONFIRM_SOURCE_BLOCK_JOB })
	async onConfirmBlockFailed(job: Job<ConfirmBlockDto>): Promise<void> {
		const { data } = job
		data.ttl -= 1

		this.emitEvent(data.swapId, SwapStatus.Confirmed, data.blockConfirmations)

		await this.sourceSwapsQueue.add(CONFIRM_SOURCE_BLOCK_JOB, data, {
			delay: ETH_BLOCK_TRACKING_INTERVAL,
			priority: 1,
		})
	}

	@OnQueueCompleted({ name: CONFIRM_SOURCE_BLOCK_JOB })
	async onConfirmBlockCompleted(
		job: Job<ConfirmBlockDto>,
		resultContinue?: boolean,
	): Promise<void> {
		if (resultContinue == null) {
			return
		}

		const { data } = job
		if (resultContinue) {
			await this.destinationSwapsQueue.add(TRANSFER_DESTINATION_SWAP_JOB, data, {
				priority: 1,
			})

			const jobData: TransferSourceFeeDto = {
				swapId: data.swapId,
				ttl: BLOCK_CONFIRMATION_TTL,
			}
			await this.sourceSwapsQueue.add(TRANSFER_SOURCE_FEE_JOB, jobData, {
				priority: 3,
			})
			return
		}

		data.blockNumber += 1
		data.ttl = BLOCK_CONFIRMATION_TTL
		data.blockConfirmations += 1

		this.emitEvent(data.swapId, SwapStatus.Confirmed, data.blockConfirmations)

		await this.sourceSwapsQueue.add(CONFIRM_SOURCE_BLOCK_JOB, data, {
			delay: ETH_BLOCK_TRACKING_INTERVAL,
			priority: 1,
		})
	}

	@Process(TRANSFER_SOURCE_FEE_JOB)
	async transferSourceFee(job: Job<TransferSourceFeeDto>): Promise<void> {
		try {
			const { data } = job
			this.logger.debug(`Start transferring source fee for swap ${data.swapId}`)

			const swap = await this.swapsService.findOne(data.swapId)
			if (!swap) {
				this.logger.error(`Swap ${data.swapId} is not found`)
				return
			}

			if (data.ttl <= 0) {
				return
			}

			const sourceWallet = this.signer.createWallet(`0x${swap.sourceWallet.secretKey}`)
			const sourceContract = this.contract.create(
				`0x${swap.sourceToken.address}`,
				EthSourceSwapsProcessor.tokenContractAbi,
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
					sourceAddress: swap.sourceAddress,
					sourceAmount: swap.sourceAmount,
					sourceTransactionHash: swap.sourceTransactionHash,
					destinationAmount: swap.destinationAmount,
					destinationTransactionHash: swap.destinationTransactionHash,
					fee: swap.fee,
					collectorTransactionHash: this.normalizeHex(transaction.hash),
					status: swap.status,
					blockConfirmations: swap.blockConfirmations,
				},
				swap.sourceToken,
				swap.destinationToken,
			)

			this.logger.log(`Source fee for swap ${data.swapId} transferred successfully`)
		} catch (err: unknown) {
			this.logger.debug(err)
			throw err
		}
	}

	@OnQueueFailed({ name: TRANSFER_SOURCE_FEE_JOB })
	async onTransferSourceFeeFailed(job: Job<TransferSourceFeeDto>, err: Error): Promise<void> {
		const { data } = job
		data.ttl -= 1

		await this.sourceSwapsQueue.add(TRANSFER_SOURCE_FEE_JOB, data, {
			delay: ETH_BLOCK_TRACKING_INTERVAL,
			priority: 3,
		})
	}

	private async checkBlock(blockNumber: number): Promise<BlockWithTransactions> {
		const cacheKey = blockNumber.toString()
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

	private async rejectSwap(swap: Swap, errorMessage: string, status: SwapStatus): Promise<void> {
		await this.swapsService.update(
			{
				id: swap.id,
				sourceAddress: swap.sourceAddress,
				sourceAmount: swap.sourceAmount,
				sourceTransactionHash: swap.sourceTransactionHash,
				destinationAmount: swap.destinationAmount,
				fee: swap.fee,
				status,
				blockConfirmations: swap.blockConfirmations,
			},
			swap.sourceToken,
			swap.destinationToken,
		)

		this.logger.error(`Swap ${swap.id} failed: ${errorMessage}`)
	}

	private emitEvent(swapId: string, status: SwapStatus, currentConfirmations = 0): void {
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
