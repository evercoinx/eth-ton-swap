import { InjectQueue, OnQueueFailed, Process, Processor } from "@nestjs/bull"
import { Logger } from "@nestjs/common"
import { Job, Queue } from "bull"
import { id, InfuraProvider, InjectEthersProvider, Interface } from "nestjs-ethers"
import { BLOCK_TRACKING_INTERVAL, SWAP_CONFIRMATION_JOB, SWAPS_QUEUE } from "./contstants"
import { SwapConfirmation } from "./interfaces/swap-confirmation"
import { SwapStatus } from "./swap.entity"
import { SwapsService } from "./swaps.service"

@Processor(SWAPS_QUEUE)
export class SwapsProcessor {
	static MaxConfirmationTTL = 10

	private readonly logger = new Logger(SwapsProcessor.name)
	private readonly contractInterface: Interface

	constructor(
		private readonly swapsService: SwapsService,
		@InjectQueue(SWAPS_QUEUE)
		private readonly swapsQueue: Queue,
		@InjectEthersProvider()
		private readonly infuraProvider: InfuraProvider,
	) {
		const abi = ["event Transfer(address indexed from, address indexed to, uint value)"]
		this.contractInterface = new Interface(abi)
	}

	@Process(SWAP_CONFIRMATION_JOB)
	async handleSwapConfirmation(job: Job<SwapConfirmation>): Promise<void> {
		try {
			this.logger.debug(`Start swap confirmation in block ${job.data.trackingBlock}`)

			if (job.data.ttl > SwapsProcessor.MaxConfirmationTTL) {
				await this.swapsService.update({
					id: job.data.swapId,
					status: SwapStatus.Rejected,
				})
				this.logger.error(
					`Unable to handle swap confirmation: exceeded TTL=${job.data.ttl}`,
				)
				return
			}

			const swap = await this.swapsService.findOne(job.data.swapId)
			if (swap.status !== SwapStatus.Pending) {
				this.logger.warn(`Job already processed: skip swap confirmation`)
				return
			}

			if (job.data.ttl > 1) {
				const block = await this.infuraProvider.getBlock(job.data.trackingBlock)
				if (!block) {
					throw new Error(`Block not found`)
				}
			}

			const logs = await this.infuraProvider.getLogs({
				address: job.data.tokenAddress,
				topics: [id("Transfer(address,address,uint256)")],
				fromBlock: job.data.trackingBlock,
				toBlock: job.data.trackingBlock,
			})

			for (const log of logs) {
				const logDescription = this.contractInterface.parseLog(log)
				if (!logDescription || logDescription.args.length !== 3) {
					continue
				}

				const [from, to, value] = logDescription.args
				if (to === job.data.walletAddress) {
					await this.swapsService.update({
						id: job.data.swapId,
						sourceAddress: from,
						status: SwapStatus.Fulfilled,
					})
					this.logger.log(`Swap confirmation completed successfully`)
					return
				}
			}

			throw new Error(`Transfer not found`)
		} catch (err: unknown) {
			this.logger.debug(err)
			throw err
		}
	}

	@OnQueueFailed({ name: SWAP_CONFIRMATION_JOB })
	async handleFailedJod(job: Job<SwapConfirmation>, err: Error) {
		if (err.message === "Transfer not found") {
			job.data.trackingBlock += 1
		}
		job.data.ttl += 1

		await this.swapsQueue.add(SWAP_CONFIRMATION_JOB, job.data, {
			delay: BLOCK_TRACKING_INTERVAL,
		})
	}
}
