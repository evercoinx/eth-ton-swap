import { InjectQueue, OnQueueFailed, Process, Processor } from "@nestjs/bull"
import { Logger } from "@nestjs/common"
import { Job, Queue } from "bull"
import ExpiryMap from "expiry-map"
import { formatEther, id, InfuraProvider, InjectEthersProvider, Interface } from "nestjs-ethers"
import {
	BLOCK_TRACKING_INTERVAL,
	SWAP_CONFIRMATION_JOB,
	SWAP_CONFIRMATION_TTL,
	SWAPS_QUEUE,
} from "./contstants"
import { SwapConfirmationDto } from "./dto/swap-confirmation.dto"
import { SwapStatus } from "./swap.entity"
import { SwapsService } from "./swaps.service"

@Processor(SWAPS_QUEUE)
export class SwapsProcessor {
	private readonly logger = new Logger(SwapsProcessor.name)
	private readonly contractInterface: Interface
	private readonly blockCache: ExpiryMap

	constructor(
		private readonly swapsService: SwapsService,
		@InjectQueue(SWAPS_QUEUE)
		private readonly swapsQueue: Queue,
		@InjectEthersProvider()
		private readonly infuraProvider: InfuraProvider,
	) {
		const abi = ["event Transfer(address indexed from, address indexed to, uint amount)"]
		this.contractInterface = new Interface(abi)
		this.blockCache = new ExpiryMap<number, boolean>(BLOCK_TRACKING_INTERVAL * 5)
	}

	@Process(SWAP_CONFIRMATION_JOB)
	async confirmSwap(job: Job<SwapConfirmationDto>): Promise<void> {
		try {
			const { data } = job
			this.logger.debug(`Start confirming swap ${data.swapId} in block ${data.trackingBlock}`)

			if (data.ttl <= 0) {
				await this.rejectSwapJob(job, `TTL reaches ${data.ttl}`)
				return
			}

			const swap = await this.swapsService.findOne(data.swapId)
			if (swap.status !== SwapStatus.Pending) {
				this.logger.warn(`Swap ${data.swapId} already confirmed: skipped`)
				return
			}

			if (data.ttl !== SWAP_CONFIRMATION_TTL && !this.blockCache.get(data.trackingBlock)) {
				const block = await this.infuraProvider.getBlock(data.trackingBlock)
				if (!block) {
					throw new Error(`Block not found`)
				}
			}
			this.blockCache.set(data.trackingBlock, true)

			const logs = await this.infuraProvider.getLogs({
				address: swap.sourceToken.address,
				topics: [id("Transfer(address,address,uint256)")],
				fromBlock: data.trackingBlock,
				toBlock: data.trackingBlock,
			})

			for (const log of logs) {
				const logDescription = this.contractInterface.parseLog(log)
				if (!logDescription || logDescription.args.length !== 3) {
					continue
				}

				const [fromAddress, toAddress, transferAmount] = logDescription.args
				if (this.normalizeHex(toAddress) !== swap.wallet.address) {
					continue
				}

				const sourceAmount = formatEther(transferAmount.toString())
				if (sourceAmount !== swap.sourceAmount) {
					const { destinationAmount, fee } = this.swapsService.calculateSwapAmounts(
						sourceAmount,
						swap.sourceToken,
						swap.destinationToken,
					)
					if (destinationAmount.lte(0)) {
						await this.rejectSwapJob(
							job,
							`Not enough amount for token swap: ${transferAmount.toString()} ETH`,
						)
						return
					}

					swap.sourceAmount = sourceAmount.toString()
					swap.destinationAmount = destinationAmount.toString()
					swap.fee = fee.toString()
				}

				await this.swapsService.update(
					{
						id: data.swapId,
						sourceAddress: this.normalizeHex(fromAddress),
						sourceAmount: swap.sourceAmount,
						destinationAmount: swap.destinationAmount,
						fee: swap.fee,
						status: SwapStatus.Fulfilled,
					},
					swap.sourceToken,
					swap.destinationToken,
				)
				this.logger.log(`Swap ${data.swapId} confirmed successfully`)
				return
			}

			throw new Error(`Transfer not found`)
		} catch (err: unknown) {
			this.logger.debug(err)
			throw err
		}
	}

	@OnQueueFailed({ name: SWAP_CONFIRMATION_JOB })
	async handleFailedJod(job: Job<SwapConfirmationDto>, err: Error) {
		const { data } = job
		if (err.message === "Transfer not found") {
			data.trackingBlock += 1
		}
		data.ttl -= 1

		await this.swapsQueue.add(SWAP_CONFIRMATION_JOB, data, {
			delay: BLOCK_TRACKING_INTERVAL,
		})
	}

	private async rejectSwapJob(job: Job<SwapConfirmationDto>, message: string): Promise<void> {
		const { data } = job
		await this.swapsService.update({
			id: data.swapId,
			status: SwapStatus.Rejected,
		})
		this.logger.error(`Unable to confirm swap ${data.swapId}: ${message}`)
	}

	private normalizeHex(hexStr: string): string {
		return hexStr.startsWith("0x") ? hexStr.slice(2) : hexStr
	}
}
