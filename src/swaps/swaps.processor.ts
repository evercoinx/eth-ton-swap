import { InjectQueue, OnQueueCompleted, OnQueueFailed, Process, Processor } from "@nestjs/bull"
import { Logger } from "@nestjs/common"
import BigNumber from "bignumber.js"
import { Job, Queue } from "bull"
import ExpiryMap from "expiry-map"
import { formatEther, id, InfuraProvider, InjectEthersProvider, Interface } from "nestjs-ethers"
import { EventsService } from "src/app/events.service"
import {
	BLOCK_CONFIRMATION_COUNT,
	BLOCK_CONFIRMATION_JOB,
	BLOCK_TRACKING_INTERVAL,
	SWAP_CONFIRMATION_JOB,
	SWAPS_QUEUE,
} from "./contstants"
import { BlockConfirmationDto } from "./dto/block-confirmation.dto"
import { SwapConfirmationDto } from "./dto/swap-confirmation.dto"
import { TransferEventParams } from "./interfaces/transfer-event-params"
import { Swap, SwapStatus } from "./swap.entity"
import { SwapsService } from "./swaps.service"

@Processor(SWAPS_QUEUE)
export class SwapsProcessor {
	private readonly logger = new Logger(SwapsProcessor.name)
	private readonly contractInterface: Interface
	private readonly blockCache: ExpiryMap

	constructor(
		private readonly eventsService: EventsService,
		private readonly swapsService: SwapsService,
		@InjectQueue(SWAPS_QUEUE)
		private readonly swapsQueue: Queue,
		@InjectEthersProvider()
		private readonly infuraProvider: InfuraProvider,
	) {
		const abi = ["event Transfer(address indexed from, address indexed to, uint amount)"]
		this.contractInterface = new Interface(abi)
		this.blockCache = new ExpiryMap<number, boolean>(BLOCK_TRACKING_INTERVAL * 6)
	}

	@Process(SWAP_CONFIRMATION_JOB)
	async confirmSwap(job: Job<SwapConfirmationDto>): Promise<void> {
		try {
			const { data } = job
			this.logger.debug(`Start confirming swap ${data.swapId} for block #${data.blockNumber}`)

			const swap = await this.swapsService.findOne(data.swapId)
			if (!swap) {
				throw new Error("Swap not found")
			}
			if (swap.status !== SwapStatus.Pending) {
				this.logger.warn(`Swap ${data.swapId} should be in pending status: skipped`)
				return
			}

			if (data.ttl <= 0) {
				await this.rejectSwapConfirmation(swap, `Swap expired. Its TTL reached ${data.ttl}`)
				return
			}

			if (!this.blockCache.get(data.blockNumber)) {
				const block = await this.infuraProvider.getBlock(data.blockNumber)
				if (!block) {
					throw new Error("Block not found")
				}
				this.blockCache.set(data.blockNumber, true)
			}

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
					const { destinationAmount, fee } = this.swapsService.calculateSwapAmounts(
						transferAmount.toString(),
						swap.sourceToken,
						swap.destinationToken,
					)
					if (new BigNumber(destinationAmount).lte(0) || new BigNumber(fee).lte(0)) {
						await this.rejectSwapConfirmation(
							swap,
							`Not enough amount to swap tokens: ${transferAmount} ETH`,
						)
						return
					}

					swap.sourceAmount = transferAmount.toString()
					swap.destinationAmount = destinationAmount
					swap.fee = fee
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

				await this.swapsQueue.add(BLOCK_CONFIRMATION_JOB, data, {
					delay: BLOCK_TRACKING_INTERVAL,
				})
				this.logger.log(
					`Swap ${data.swapId} confirmed with block #${data.blockNumber} successfully`,
				)
				return
			}

			throw new Error("Transfer not found")
		} catch (err: unknown) {
			this.logger.debug(err)
			throw err
		}
	}

	@OnQueueFailed({ name: SWAP_CONFIRMATION_JOB })
	async handleFailedSwapConfirmation(job: Job<SwapConfirmationDto>, err: Error): Promise<void> {
		if (err.message === "Swap not found") {
			return
		}

		const { data } = job
		if (err.message === "Transfer not found") {
			data.blockNumber += 1
		}
		data.ttl -= 1

		await this.swapsQueue.add(SWAP_CONFIRMATION_JOB, data, {
			delay: BLOCK_TRACKING_INTERVAL,
		})
	}

	@Process(BLOCK_CONFIRMATION_JOB)
	async confirmBlock(job: Job<BlockConfirmationDto>): Promise<boolean> {
		try {
			const { data } = job
			const swap = await this.swapsService.findOne(data.swapId)
			if (!swap) {
				throw new Error("Swap not found")
			}

			if (swap.status !== SwapStatus.Confirmed) {
				this.logger.warn(`Swap ${data.swapId} should be in confirmed status: skipped`)
				return false
			}

			if (!this.blockCache.get(data.blockNumber)) {
				const block = await this.infuraProvider.getBlock(data.blockNumber)
				if (!block) {
					throw new Error("Block not found")
				}
				this.blockCache.set(data.blockNumber, true)
			}

			const confirmationCount = swap.confirmationCount + 1
			const swapFinalized = confirmationCount === BLOCK_CONFIRMATION_COUNT

			await this.swapsService.update(
				{
					id: swap.id,
					sourceAmount: swap.sourceAmount,
					destinationAmount: swap.destinationAmount,
					fee: swap.fee,
					status: swapFinalized ? SwapStatus.Finalized : SwapStatus.Confirmed,
					confirmationCount,
				},
				swap.sourceToken,
				swap.destinationToken,
			)

			this.logger.log(
				`Swap ${data.swapId} ${swapFinalized ? "finalized" : "confirmed"} with block #${
					data.blockNumber
				} successfully; confirmation count: ${confirmationCount}`,
			)
			return swapFinalized
		} catch (err: unknown) {
			this.logger.debug(err)
			throw err
		}
	}

	@OnQueueFailed({ name: BLOCK_CONFIRMATION_JOB })
	async handleFailedBlockConfirmation(job: Job<BlockConfirmationDto>, err: Error): Promise<void> {
		if (err.message === "Swap not found") {
			return
		}

		const { data } = job
		if (err.message !== "Block not found") {
			data.blockNumber += 1
		}

		await this.swapsQueue.add(BLOCK_CONFIRMATION_JOB, data, {
			delay: BLOCK_TRACKING_INTERVAL,
			attempts: BLOCK_CONFIRMATION_COUNT,
		})
	}

	@OnQueueCompleted({ name: BLOCK_CONFIRMATION_JOB })
	async handleCompletedBlockConfirmation(
		job: Job<BlockConfirmationDto>,
		result: boolean,
	): Promise<void> {
		if (result) {
			return
		}

		const { data } = job
		data.blockNumber += 1

		await this.swapsQueue.add(BLOCK_CONFIRMATION_JOB, data, {
			delay: BLOCK_TRACKING_INTERVAL,
			attempts: BLOCK_CONFIRMATION_COUNT,
		})
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

		this.eventsService.emit({ error: errorMessage })
		this.logger.error(`Unable to confirm swap ${swap.id}: ${errorMessage}`)
	}

	private normalizeHex(hexStr: string): string {
		return hexStr.startsWith("0x") ? hexStr.slice(2) : hexStr
	}
}
