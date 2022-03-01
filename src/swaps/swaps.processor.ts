import { InjectQueue, OnQueueCompleted, OnQueueFailed, Process, Processor } from "@nestjs/bull"
import { Logger } from "@nestjs/common"
import BigNumber from "bignumber.js"
import { Job, Queue } from "bull"
import ExpiryMap from "expiry-map"
import { formatEther, id, InfuraProvider, InjectEthersProvider, Interface } from "nestjs-ethers"
import { EventsService } from "src/common/events.service"
import { TonService } from "src/ton/ton.service"
import {
	BLOCK_CONFIRMATION_COUNT,
	BLOCK_CONFIRMATION_JOB,
	BLOCK_TRACKING_INTERVAL,
	SWAP_CONFIRMATION_JOB,
	SWAPS_QUEUE,
} from "./constants"
import { BlockConfirmationDto } from "./dto/block-confirmation.dto"
import { SwapConfirmationDto } from "./dto/swap-confirmation.dto"
import { SwapEvent } from "./interfaces/swap-event.interface"
import { TransferEventParams } from "./interfaces/transfer-event-params.interface"
import { Swap, SwapStatus } from "./swap.entity"
import { SwapsService } from "./swaps.service"

@Processor(SWAPS_QUEUE)
export class SwapsProcessor {
	private readonly logger = new Logger(SwapsProcessor.name)
	private readonly contractInterface: Interface
	private readonly blockCache: ExpiryMap<number, boolean>

	constructor(
		private readonly swapsService: SwapsService,
		private readonly eventsService: EventsService,
		private readonly tonService: TonService,
		@InjectQueue(SWAPS_QUEUE)
		private readonly swapsQueue: Queue,
		@InjectEthersProvider()
		private readonly infuraProvider: InfuraProvider,
	) {
		const abi = ["event Transfer(address indexed from, address indexed to, uint amount)"]
		this.contractInterface = new Interface(abi)
		this.blockCache = new ExpiryMap(BLOCK_TRACKING_INTERVAL * 6)
	}

	@Process(SWAP_CONFIRMATION_JOB)
	async confirmSwap(job: Job<SwapConfirmationDto>): Promise<boolean> {
		try {
			const { data } = job
			this.logger.debug(`Start confirming swap ${data.swapId} in block #${data.blockNumber}`)

			let swap = await this.swapsService.findOne(data.swapId)
			if (!swap) {
				this.logger.error(`Swap ${data.swapId} is not found`)
				return false
			}

			if (swap.status !== SwapStatus.Pending) {
				this.logger.warn(`Swap ${data.swapId} should be in pending status: skipped`)
				return false
			}

			if (data.ttl <= 0) {
				await this.rejectSwapConfirmation(swap, `TTL reached ${data.ttl}`)
				return false
			}

			await this.checkBlock(data.blockNumber)

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
				if (this.normalizeHex(toAddress) !== swap.wallet.address) {
					continue
				}

				const transferAmount = formatEther(amount.toString())
				if (!new BigNumber(transferAmount).eq(swap.sourceAmount)) {
					swap = this.recalculateSwap(swap, transferAmount)
					if (!swap) {
						await this.rejectSwapConfirmation(
							swap,
							`Not enough amount to swap tokens: ${transferAmount} ETH`,
						)
						return false
					}
				}

				await this.swapsService.update(
					{
						id: data.swapId,
						sourceAddress: this.normalizeHex(fromAddress),
						sourceAmount: swap.sourceAmount,
						destinationAmount: swap.destinationAmount,
						fee: swap.fee,
						status: SwapStatus.Confirmed,
					},
					swap.sourceToken,
					swap.destinationToken,
				)
				return true
			}

			throw new Error("Transfer not found")
		} catch (err: unknown) {
			this.logger.debug(err)
			throw err
		}
	}

	@OnQueueFailed({ name: SWAP_CONFIRMATION_JOB })
	async handleFailedSwapConfirmation(job: Job<SwapConfirmationDto>, err: Error): Promise<void> {
		const { data } = job
		if (err.message === "Transfer not found") {
			data.blockNumber += 1
		}
		data.ttl -= 1

		this.emitEvent(data.swapId, SwapStatus.Pending)

		await this.swapsQueue.add(SWAP_CONFIRMATION_JOB, data, {
			delay: BLOCK_TRACKING_INTERVAL,
		})
	}

	@OnQueueCompleted({ name: SWAP_CONFIRMATION_JOB })
	async handleCompletedSwapConfirmation(
		job: Job<SwapConfirmationDto>,
		result: boolean,
	): Promise<void> {
		const { data } = job
		if (!result) {
			this.emitEvent(data.swapId, SwapStatus.Rejected)
			return
		}

		this.emitEvent(data.swapId, SwapStatus.Confirmed)
		this.logger.log(`Swap ${data.swapId} confirmed in block #${data.blockNumber} successfully`)

		await this.swapsQueue.add(
			BLOCK_CONFIRMATION_JOB,
			{
				swapId: data.swapId,
				blockNumber: data.blockNumber,
				ttl: BLOCK_CONFIRMATION_COUNT,
				confirmedBlockCount: 0,
			},
			{
				delay: BLOCK_TRACKING_INTERVAL,
			},
		)
	}

	@Process(BLOCK_CONFIRMATION_JOB)
	async confirmBlock(job: Job<BlockConfirmationDto>): Promise<boolean> {
		try {
			const { data } = job
			if (data.ttl <= 0) {
				this.logger.warn(
					`Unable to confirm block for swap ${data.swapId}: TTL reached ${data.ttl}`,
				)
				return false
			}

			const swap = await this.swapsService.findOne(data.swapId)
			if (!swap) {
				this.logger.error(`Swap ${data.swapId} is not found`)
				return false
			}

			if (swap.status !== SwapStatus.Confirmed) {
				this.logger.warn(`Swap ${data.swapId} should be in confirmed status: skipped`)
				return false
			}

			await this.checkBlock(data.blockNumber)

			const confirmedBlockCount = swap.confirmedBlockCount + 1
			const swapFinalized = confirmedBlockCount === BLOCK_CONFIRMATION_COUNT

			await this.swapsService.update(
				{
					id: swap.id,
					sourceAmount: swap.sourceAmount,
					destinationAmount: swap.destinationAmount,
					fee: swap.fee,
					status: swapFinalized ? SwapStatus.Finalized : SwapStatus.Confirmed,
					confirmedBlockCount,
				},
				swap.sourceToken,
				swap.destinationToken,
			)

			this.logger.log(
				`Swap ${data.swapId} ${swapFinalized ? "finalized" : "confirmed"} with block #${
					data.blockNumber
				} successfully; confirmed block count: ${confirmedBlockCount}`,
			)
			return swapFinalized
		} catch (err: unknown) {
			this.logger.debug(err)
			throw err
		}
	}

	@OnQueueFailed({ name: BLOCK_CONFIRMATION_JOB })
	async handleFailedBlockConfirmation(job: Job<BlockConfirmationDto>): Promise<void> {
		const { data } = job
		data.ttl -= 1

		this.emitEvent(data.swapId, SwapStatus.Confirmed, data.confirmedBlockCount)

		await this.swapsQueue.add(BLOCK_CONFIRMATION_JOB, data, {
			delay: BLOCK_TRACKING_INTERVAL,
		})
	}

	@OnQueueCompleted({ name: BLOCK_CONFIRMATION_JOB })
	async handleCompletedBlockConfirmation(
		job: Job<BlockConfirmationDto>,
		result: boolean,
	): Promise<void> {
		const { data } = job
		if (result) {
			return await this.transferTon(data.swapId)
		}

		data.blockNumber += 1
		data.ttl = BLOCK_CONFIRMATION_COUNT
		data.confirmedBlockCount += 1

		this.emitEvent(data.swapId, SwapStatus.Confirmed, data.confirmedBlockCount)

		await this.swapsQueue.add(BLOCK_CONFIRMATION_JOB, data, {
			delay: BLOCK_TRACKING_INTERVAL,
		})
	}

	private async transferTon(swapId: string): Promise<void> {
		const swap = await this.swapsService.findOne(swapId)
		if (!swap) {
			await this.rejectSwapConfirmation(swap, `Swap is not found`)
			this.emitEvent(swapId, SwapStatus.Rejected, BLOCK_CONFIRMATION_COUNT)
			return
		}

		try {
			await this.tonService.transfer(
				swap.wallet.secretKey,
				swap.destinationAddress,
				swap.destinationAmount,
			)
		} catch (err: unknown) {
			await this.rejectSwapConfirmation(
				swap,
				`Unable to transfer ${swap.destinationAmount} TON to ${swap.destinationAddress}`,
			)
			this.emitEvent(swapId, SwapStatus.Rejected, BLOCK_CONFIRMATION_COUNT)
			return
		}

		this.emitEvent(swapId, SwapStatus.Finalized, BLOCK_CONFIRMATION_COUNT)
		this.logger.log(
			`Swap ${swapId} finalized successfully: ${swap.destinationAmount} TON transferred to ${swap.destinationAddress}`,
		)
		return
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

	private async checkBlock(blockNumber: number) {
		if (!this.blockCache.get(blockNumber)) {
			const block = await this.infuraProvider.getBlock(blockNumber)
			if (!block) {
				throw new Error("Block not found")
			}
			this.blockCache.set(blockNumber, true)
		}
	}

	private async rejectSwapConfirmation(swap: Swap, errorMessage: string): Promise<void> {
		await this.swapsService.update(
			{
				id: swap.id,
				sourceAmount: swap.sourceAmount,
				destinationAmount: swap.destinationAmount,
				fee: swap.fee,
				status: SwapStatus.Rejected,
			},
			swap.sourceToken,
			swap.destinationToken,
		)

		this.logger.error(`Unable to confirm swap ${swap.id}: ${errorMessage}`)
	}

	private emitEvent(swapId: string, status: SwapStatus, confirmedBlockCount = 0): void {
		this.eventsService.emit({
			id: swapId,
			status,
			confirmedBlockCount,
			totalBlockCount: BLOCK_CONFIRMATION_COUNT,
			createdAt: Date.now(),
		} as SwapEvent)
	}

	private normalizeHex(hexStr: string): string {
		return hexStr.startsWith("0x") ? hexStr.slice(2) : hexStr
	}
}
