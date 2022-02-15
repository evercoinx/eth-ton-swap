import { InjectQueue, OnQueueFailed, Process, Processor } from "@nestjs/bull"
import { Logger } from "@nestjs/common"
import { Job, Queue } from "bull"
import ExpiryMap from "expiry-map"
import { id, InfuraProvider, InjectEthersProvider, Interface } from "nestjs-ethers"
import {
	BLOCK_TRACKING_INTERVAL,
	SWAP_CONFIRMATION_JOB,
	SWAP_CONFIRMATION_TTL,
	SWAPS_QUEUE,
} from "./contstants"
import { SwapConfirmation } from "./interfaces/swap-confirmation"
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
		const abi = ["event Transfer(address indexed from, address indexed to, uint value)"]
		this.contractInterface = new Interface(abi)
		this.blockCache = new ExpiryMap<number, boolean>(BLOCK_TRACKING_INTERVAL * 5)
	}

	@Process(SWAP_CONFIRMATION_JOB)
	async handleSwapConfirmation(job: Job<SwapConfirmation>): Promise<void> {
		try {
			const { data } = job
			this.logger.debug(
				`Start swap ${data.swapId} confirmation in block ${data.trackingBlock}`,
			)

			if (data.ttl <= 0) {
				await this.swapsService.update({
					id: data.swapId,
					status: SwapStatus.Rejected,
				})
				this.logger.error(
					`Unable to handle swap ${data.swapId} confirmation: TTL reaches ${data.ttl}`,
				)
				return
			}

			const swap = await this.swapsService.findOne(data.swapId)
			if (swap.status !== SwapStatus.Pending) {
				this.logger.warn(`Job already processed: skip swap ${data.swapId} confirmation`)
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
				address: data.tokenAddress,
				topics: [id("Transfer(address,address,uint256)")],
				fromBlock: data.trackingBlock,
				toBlock: data.trackingBlock,
			})

			for (const log of logs) {
				const logDescription = this.contractInterface.parseLog(log)
				if (!logDescription || logDescription.args.length !== 3) {
					continue
				}

				const [from, to, value] = logDescription.args
				if (to === data.walletAddress) {
					await this.swapsService.update({
						id: data.swapId,
						sourceAddress: from,
						status: SwapStatus.Fulfilled,
					})
					this.logger.log(`Swap ${data.swapId} confirmation completed successfully`)
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
		const { data } = job
		if (err.message === "Transfer not found") {
			data.trackingBlock += 1
		}
		data.ttl -= 1

		await this.swapsQueue.add(SWAP_CONFIRMATION_JOB, data, {
			delay: BLOCK_TRACKING_INTERVAL,
		})
	}
}
