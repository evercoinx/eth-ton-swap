import { InjectQueue, OnQueueCompleted, OnQueueFailed, Process, Processor } from "@nestjs/bull"
import { Logger } from "@nestjs/common"
import BigNumber from "bignumber.js"
import { Job, Queue } from "bull"
import ExpiryMap from "expiry-map"
import { id, InfuraProvider, InjectEthersProvider, Interface } from "nestjs-ethers"
import { EventsService } from "src/common/events.service"
import {
	BLOCK_CONFIRMATION_COUNT,
	BLOCK_CONFIRMATION_JOB,
	BLOCK_CONFIRMATION_TTL,
	ETH_BLOCK_TRACKING_INTERVAL,
	SOURCE_SWAP_CONFIRMATION_JOB,
	SOURCE_SWAPS_QUEUE,
	DESTINATION_SWAP_CONFIRMATION_JOB,
} from "../constants"
import { ConfirmBlockDto } from "../dto/confirm-block.dto"
import { ConfirmSourceSwapDto } from "../dto/confirm-source-swap.dto"
import { SwapEvent } from "../interfaces/swap-event.interface"
import { TransferEventParams } from "../interfaces/transfer-event-params.interface"
import { Swap, SwapStatus } from "../swap.entity"
import { SwapsService } from "../swaps.service"

@Processor(SOURCE_SWAPS_QUEUE)
export class SourceSwapsProcessor {
	private readonly logger = new Logger(SourceSwapsProcessor.name)
	private readonly contractInterface: Interface
	private readonly blockCache: ExpiryMap<number, boolean>

	constructor(
		private readonly swapsService: SwapsService,
		private readonly eventsService: EventsService,
		@InjectQueue(SOURCE_SWAPS_QUEUE)
		private readonly swapsQueue: Queue,
		@InjectEthersProvider()
		private readonly infuraProvider: InfuraProvider,
	) {
		const abi = ["event Transfer(address indexed from, address indexed to, uint amount)"]
		this.contractInterface = new Interface(abi)
		this.blockCache = new ExpiryMap(ETH_BLOCK_TRACKING_INTERVAL * 6)
	}

	@Process(SOURCE_SWAP_CONFIRMATION_JOB)
	async confirmSourceSwap(job: Job<ConfirmSourceSwapDto>): Promise<SwapStatus> {
		try {
			const { data } = job
			this.logger.debug(
				`Start confirming source swap ${data.swapId} in block #${data.blockNumber}`,
			)

			const swap = await this.swapsService.findOne(data.swapId)
			if (!swap) {
				await this.rejectSwap(swap, `Swap is not found`, SwapStatus.Rejected)
				return SwapStatus.Rejected
			}

			if (swap.status !== SwapStatus.Pending) {
				await this.rejectSwap(
					swap,
					`Swap ${data.swapId} should be in pending status: skipped`,
					SwapStatus.Rejected,
				)
				return SwapStatus.Rejected
			}

			if (data.ttl <= 0) {
				await this.rejectSwap(swap, `TTL reached ${data.ttl}`, SwapStatus.Expired)
				return SwapStatus.Expired
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
				if (this.normalizeHex(toAddress) !== swap.sourceWallet.address) {
					continue
				}

				// if (!new BigNumber(amount).eq(swap.sourceAmount)) {
				// 	swap = this.recalculateSwap(swap, amount.toString())
				// 	if (!swap) {
				// 		await this.rejectSwap(
				// 			swap,
				// 			`Not enough amount to swap tokens: ${amount.toString()} ETH`,
				// 		)
				// 		return false
				// 	}
				// }

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
				return SwapStatus.Confirmed
			}

			throw new Error("Transfer not found")
		} catch (err: unknown) {
			this.logger.debug(err)
			throw err
		}
	}

	@OnQueueFailed({ name: SOURCE_SWAP_CONFIRMATION_JOB })
	async handleFailedSwapConfirmation(job: Job<ConfirmSourceSwapDto>, err: Error): Promise<void> {
		const { data } = job
		if (err.message === "Transfer not found") {
			data.blockNumber += 1
		}
		data.ttl -= 1

		this.emitEvent(data.swapId, SwapStatus.Pending)

		await this.swapsQueue.add(SOURCE_SWAP_CONFIRMATION_JOB, data, {
			delay: ETH_BLOCK_TRACKING_INTERVAL,
		})
	}

	@OnQueueCompleted({ name: SOURCE_SWAP_CONFIRMATION_JOB })
	async handleCompletedSwapConfirmation(
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
			confirmedBlockCount: 0,
		}
		await this.swapsQueue.add(BLOCK_CONFIRMATION_JOB, jobData, {
			delay: ETH_BLOCK_TRACKING_INTERVAL,
		})
	}

	@Process(BLOCK_CONFIRMATION_JOB)
	async confirmBlock(job: Job<ConfirmBlockDto>): Promise<boolean | undefined> {
		try {
			const { data } = job
			if (data.ttl <= 0) {
				this.logger.warn(
					`Unable to confirm block for swap ${data.swapId}: TTL reached ${data.ttl}`,
				)
				return
			}

			const swap = await this.swapsService.findOne(data.swapId)
			if (!swap) {
				this.logger.error(`Swap ${data.swapId} is not found`)
				return
			}

			if (swap.status !== SwapStatus.Confirmed) {
				this.logger.warn(`Swap ${data.swapId} should be in confirmed status: skipped`)
				return
			}

			await this.checkBlock(data.blockNumber)

			const confirmedBlockCount = swap.confirmedBlockCount + 1
			const swapFullyConfirmed = confirmedBlockCount === BLOCK_CONFIRMATION_COUNT

			await this.swapsService.update(
				{
					id: swap.id,
					sourceAddress: swap.sourceAddress,
					sourceAmount: swap.sourceAmount,
					destinationAmount: swap.destinationAmount,
					fee: swap.fee,
					status: SwapStatus.Confirmed,
					confirmedBlockCount,
				},
				swap.sourceToken,
				swap.destinationToken,
			)

			this.logger.debug(
				`Swap ${data.swapId} ${swapFullyConfirmed ? "fully" : ""} confirmed with block #${
					data.blockNumber
				} with count: ${confirmedBlockCount}`,
			)
			return swapFullyConfirmed
		} catch (err: unknown) {
			this.logger.debug(err)
			throw err
		}
	}

	@OnQueueFailed({ name: BLOCK_CONFIRMATION_JOB })
	async handleFailedBlockConfirmation(job: Job<ConfirmBlockDto>): Promise<void> {
		const { data } = job
		data.ttl -= 1

		this.emitEvent(data.swapId, SwapStatus.Confirmed, data.confirmedBlockCount)

		await this.swapsQueue.add(BLOCK_CONFIRMATION_JOB, data, {
			delay: ETH_BLOCK_TRACKING_INTERVAL,
		})
	}

	@OnQueueCompleted({ name: BLOCK_CONFIRMATION_JOB })
	async handleCompletedBlockConfirmation(
		job: Job<ConfirmBlockDto>,
		resultContinue?: boolean,
	): Promise<void> {
		if (resultContinue == null) {
			return
		}

		const { data } = job
		if (resultContinue) {
			await this.swapsQueue.add(DESTINATION_SWAP_CONFIRMATION_JOB, data, {})
			return
		}

		data.blockNumber += 1
		data.ttl = BLOCK_CONFIRMATION_TTL
		data.confirmedBlockCount += 1

		this.emitEvent(data.swapId, SwapStatus.Confirmed, data.confirmedBlockCount)

		await this.swapsQueue.add(BLOCK_CONFIRMATION_JOB, data, {
			delay: ETH_BLOCK_TRACKING_INTERVAL,
		})
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
				sourceAmount: swap.sourceAmount,
				destinationAmount: swap.destinationAmount,
				fee: swap.fee,
				confirmedBlockCount: swap.confirmedBlockCount,
				status,
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
