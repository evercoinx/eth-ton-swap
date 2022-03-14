import { InjectQueue, OnQueueCompleted, OnQueueFailed, Process, Processor } from "@nestjs/bull"
import { Logger } from "@nestjs/common"
import { Job, Queue } from "bull"
import {
	EthersContract,
	EthersSigner,
	InfuraProvider,
	InjectContractProvider,
	InjectEthersProvider,
	InjectSignerProvider,
	parseUnits,
} from "nestjs-ethers"
import { EventsService } from "src/common/events.service"
import {
	ETH_BLOCK_TRACKING_INTERVAL,
	ETH_DESTINATION_SWAPS_QUEUE,
	TOTAL_BLOCK_CONFIRMATIONS,
	TRANSFER_ETH_SWAP_JOB,
} from "../constants"
import { TransferSwapDto } from "../dto/transfer-swap.dto"
import { SwapEvent } from "../interfaces/swap-event.interface"
import { SwapStatus } from "../swap.entity"
import { SwapsService } from "../swaps.service"

@Processor(ETH_DESTINATION_SWAPS_QUEUE)
export class EthDestinationSwapsProcessor {
	private static readonly contractAbi = [
		"function transfer(address to, uint amount) returns (bool)",
		"event Transfer(address indexed from, address indexed to, uint amount)",
	]

	private readonly logger = new Logger(EthDestinationSwapsProcessor.name)

	constructor(
		private readonly swapsService: SwapsService,
		private readonly eventsService: EventsService,
		@InjectQueue(ETH_DESTINATION_SWAPS_QUEUE)
		private readonly destinationSwapsQueue: Queue,
		@InjectEthersProvider()
		private readonly infuraProvider: InfuraProvider,
		@InjectSignerProvider()
		private readonly signer: EthersSigner,
		@InjectContractProvider()
		private readonly contract: EthersContract,
	) {}

	@Process(TRANSFER_ETH_SWAP_JOB)
	async transferEthSwap(job: Job<TransferSwapDto>): Promise<SwapStatus> {
		const { data } = job
		this.logger.debug(`Start transferring eth fee for swap ${data.swapId}`)

		const swap = await this.swapsService.findOne(data.swapId)
		if (!swap) {
			this.logger.error(`Swap ${data.swapId} is not found`)
			return SwapStatus.Failed
		}

		if (data.ttl <= 0) {
			this.logger.warn(
				`Unable to transfer eth fee for swap ${swap.id}: TTL reached ${data.ttl}`,
			)
			return SwapStatus.Expired
		}

		const destinationWallet = this.signer.createWallet(`0x${swap.destinationWallet.secretKey}`)
		const destinationContract = this.contract.create(
			`0x${swap.destinationToken.address}`,
			EthDestinationSwapsProcessor.contractAbi,
			destinationWallet,
		)

		const gasPrice = await this.infuraProvider.getGasPrice()
		const tokenAmount = parseUnits(swap.destinationAmount, swap.destinationToken.decimals)

		const transaction = await destinationContract.transfer(
			`0x${swap.destinationAddress}`,
			tokenAmount,
			{
				gasPrice,
				gasLimit: "100000",
			},
		)

		await this.swapsService.update(
			{
				id: swap.id,
				destinationTransactionId: this.normalizeHex(transaction.hash),
			},
			swap.sourceToken,
			swap.destinationToken,
		)
		return SwapStatus.Completed
	}

	@OnQueueFailed({ name: TRANSFER_ETH_SWAP_JOB })
	async onTransferEthSwapFailed(job: Job<TransferSwapDto>, err: Error): Promise<void> {
		const { data } = job
		this.logger.debug(`Swap ${data.swapId} failed. Error: ${err.message}. Retrying...`)

		await this.destinationSwapsQueue.add(
			TRANSFER_ETH_SWAP_JOB,
			{
				swapId: data.swapId,
				ttl: data.ttl - 1,
			} as TransferSwapDto,
			{
				delay: ETH_BLOCK_TRACKING_INTERVAL,
				priority: 1,
			},
		)
	}

	@OnQueueCompleted({ name: TRANSFER_ETH_SWAP_JOB })
	async onTransferEthSwapCompleted(
		job: Job<TransferSwapDto>,
		resultStatus: SwapStatus,
	): Promise<void> {
		const { data } = job
		if (resultStatus === SwapStatus.Failed || resultStatus === SwapStatus.Expired) {
			this.emitEvent(data.swapId, resultStatus, 0)
			return
		}

		this.emitEvent(data.swapId, SwapStatus.Completed, TOTAL_BLOCK_CONFIRMATIONS)
		this.logger.log(`Swap ${data.swapId} completed successfully`)
	}

	private emitEvent(swapId: string, status: SwapStatus, currentConfirmations: number): void {
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
