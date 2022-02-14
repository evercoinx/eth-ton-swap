import { Process, Processor } from "@nestjs/bull"
import { Logger } from "@nestjs/common"
import { Job } from "bull"
import { SWAP_CONFIRMATION, SWAPS_QUEUE } from "./contstants"
import { GetSwapDto } from "./dto/get-swap.dto"

@Processor(SWAPS_QUEUE)
export class SwapsProcessor {
	private readonly logger = new Logger(SwapsProcessor.name)

	@Process(SWAP_CONFIRMATION)
	async handleSwapConfirmation(job: Job<GetSwapDto>) {
		this.logger.log("Start processing...")
		this.logger.log(job.data)
		this.logger.log("Processing completed")
	}
}
