import { InjectQueue, OnQueueCompleted, OnQueueFailed, Process, Processor } from "@nestjs/bull"
import { CACHE_MANAGER, Inject, Logger } from "@nestjs/common"
import { Job, Queue } from "bull"
import { Cache } from "cache-manager"
import {
	EthersContract,
	EthersSigner,
	hexlify,
	InfuraProvider,
	InjectContractProvider,
	InjectEthersProvider,
	InjectSignerProvider,
	parseUnits,
} from "nestjs-ethers"
import { ERC20_TOKEN_CONTRACT_ABI, ERC20_TOKEN_TRANSFER_GAS_LIMIT } from "src/common/constants"
import { EventsService } from "src/common/events.service"
import {
	ETH_BLOCK_TRACKING_INTERVAL,
	ETH_DESTINATION_SWAPS_QUEUE,
	QUEUE_HIGH_PRIORITY,
	QUEUE_LOW_PRIORITY,
	TON_SOURCE_SWAPS_QUEUE,
	TOTAL_CONFIRMATIONS,
	TRANSFER_ETH_SWAP_JOB,
	TRANSFER_TON_FEE_JOB,
} from "../constants"
import { TransferFeeDto } from "../dto/transfer-fee.dto"
import { TransferSwapDto } from "../dto/transfer-swap.dto"
import { SwapStatus } from "../swap.entity"
import { SwapsService } from "../swaps.service"
import { EthBaseSwapsProcessor } from "./eth-base-swaps.processor"

@Processor(ETH_DESTINATION_SWAPS_QUEUE)
export class EthDestinationSwapsProcessor extends EthBaseSwapsProcessor {
	private readonly logger = new Logger(EthDestinationSwapsProcessor.name)

	constructor(
		@Inject(CACHE_MANAGER) cacheManager: Cache,
		@InjectEthersProvider() infuraProvider: InfuraProvider,
		@InjectSignerProvider() private readonly signer: EthersSigner,
		@InjectContractProvider() private readonly contract: EthersContract,
		swapsService: SwapsService,
		eventsService: EventsService,
		@InjectQueue(ETH_DESTINATION_SWAPS_QUEUE) private readonly destinationSwapsQueue: Queue,
		@InjectQueue(TON_SOURCE_SWAPS_QUEUE) private readonly sourceSwapsQueue: Queue,
	) {
		super(cacheManager, "eth:dst", infuraProvider, swapsService, eventsService)
	}

	@Process(TRANSFER_ETH_SWAP_JOB)
	async transferEthSwap(job: Job<TransferSwapDto>): Promise<SwapStatus> {
		const { data } = job
		this.logger.debug(`${data.swapId}: Start transferring swap`)

		const swap = await this.swapsService.findById(data.swapId)
		if (!swap) {
			this.logger.error(`${data.swapId}: Swap not found`)
			return SwapStatus.Failed
		}

		if (swap.expiresAt < new Date()) {
			await this.swapsService.update(
				swap.id,
				{
					status: SwapStatus.Expired,
				},
				swap.sourceToken,
				swap.destinationToken,
			)

			this.logger.error(`${swap.id}: Swap expired`)
			return SwapStatus.Expired
		}

		const walletSigner = this.signer.createWallet(`0x${swap.destinationWallet.secretKey}`)
		const destinationContract = this.contract.create(
			`0x${swap.destinationToken.address}`,
			ERC20_TOKEN_CONTRACT_ABI,
			walletSigner,
		)

		const gasPrice = await this.getGasPrice()
		const tokenAmount = parseUnits(swap.destinationAmount, swap.destinationToken.decimals)

		const transaction = await destinationContract.transfer(
			`0x${swap.destinationAddress}`,
			tokenAmount,
			{
				gasPrice: hexlify(gasPrice.toNumber()),
				gasLimit: hexlify(ERC20_TOKEN_TRANSFER_GAS_LIMIT),
			},
		)

		await this.swapsService.update(
			swap.id,
			{
				destinationTransactionId: this.normalizeHex(transaction.hash),
				status: SwapStatus.Completed,
			},
			swap.sourceToken,
			swap.destinationToken,
		)
		return SwapStatus.Completed
	}

	@OnQueueFailed({ name: TRANSFER_ETH_SWAP_JOB })
	async onTransferEthSwapFailed(job: Job<TransferSwapDto>, err: Error): Promise<void> {
		const { data } = job
		this.logger.debug(`${data.swapId}: ${err.message}: Retrying...`)

		await this.destinationSwapsQueue.add(
			TRANSFER_ETH_SWAP_JOB,
			{
				swapId: data.swapId,
			} as TransferSwapDto,
			{
				delay: ETH_BLOCK_TRACKING_INTERVAL,
				priority: QUEUE_HIGH_PRIORITY,
			},
		)
	}

	@OnQueueCompleted({ name: TRANSFER_ETH_SWAP_JOB })
	async onTransferEthSwapCompleted(
		job: Job<TransferSwapDto>,
		resultStatus: SwapStatus,
	): Promise<void> {
		const { data } = job
		if (!this.isSwapProcessable(resultStatus)) {
			this.emitEvent(data.swapId, resultStatus, 0)
			return
		}

		this.emitEvent(data.swapId, SwapStatus.Completed, TOTAL_CONFIRMATIONS)
		this.logger.log(`${data.swapId}: Swap transferred`)

		await this.sourceSwapsQueue.add(
			TRANSFER_TON_FEE_JOB,
			{
				swapId: data.swapId,
			} as TransferFeeDto,
			{
				priority: QUEUE_LOW_PRIORITY,
			},
		)
	}
}
