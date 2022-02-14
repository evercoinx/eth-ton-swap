import { InjectQueue, Process, Processor } from "@nestjs/bull"
import { Logger } from "@nestjs/common"
import { Job, Queue } from "bull"
import { attempt } from "joi"
import { id, InfuraProvider, InjectEthersProvider, Interface } from "nestjs-ethers"
import { SWAP_CONFIRMATION, SWAPS_QUEUE } from "./contstants"
import { SwapConfirmation } from "./interfaces/swap-confirmation"
import { SwapStatus } from "./swap.entity"
import { SwapsService } from "./swaps.service"

@Processor(SWAPS_QUEUE)
export class SwapsProcessor {
	private readonly logger = new Logger(SwapsProcessor.name)
	private readonly contractInterface: Interface

	static ConfirmationDelay = 5000
	static MaxConfirmatinAttemps = 10

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

	@Process(SWAP_CONFIRMATION)
	async handleSwapConfirmation(job: Job<SwapConfirmation>): Promise<void> {
		try {
			this.logger.log(`Start swap confirmation in block ${job.data.trackingBlock}...`)
			if (job.data.attempt > SwapsProcessor.MaxConfirmatinAttemps) {
				await this.swapsService.update({
					id: job.data.swapId,
					status: SwapStatus.Rejected,
				})
				this.logger.error(
					`Unable to handle swap confirmation: reached ${job.data.attempt} attempts`,
				)
				return
			}

			if (job.data.attempt > 1) {
				const block = await this.infuraProvider.getBlock(job.data.trackingBlock)
				if (!block) {
					job.data.attempt += 1
					this.logger.warn(`Block not found: reschedule swap confirmation`)
					await this.swapsQueue.add(SWAP_CONFIRMATION, job.data, {
						delay: SwapsProcessor.ConfirmationDelay * 2,
					})
					return
				}
			}

			const logs = await this.infuraProvider.getLogs({
				address: "0xc778417E063141139Fce010982780140Aa0cD5Ab",
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

			job.data.trackingBlock += 1
			job.data.attempt += 1

			this.logger.log(`Transfer not found: reschedule swap confirmation`)
			await this.swapsQueue.add(SWAP_CONFIRMATION, job.data, {
				delay: SwapsProcessor.ConfirmationDelay,
			})
		} catch (err: unknown) {
			this.logger.error(`Unable to handle swap confirmation: ${err}`)
		}
	}
}
