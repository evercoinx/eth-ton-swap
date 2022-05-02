import { InjectQueue, OnQueueCompleted, OnQueueFailed, Process, Processor } from "@nestjs/bull"
import { CACHE_MANAGER, Inject, Logger } from "@nestjs/common"
import BigNumber from "bignumber.js"
import { Job, Queue } from "bull"
import { Cache } from "cache-manager"
import {
	QUEUE_HIGH_PRIORITY,
	QUEUE_LOW_PRIORITY,
	QUEUE_MEDIUM_PRIORITY,
} from "src/common/constants"
import { EventsService } from "src/common/events.service"
import { Blockchain } from "src/tokens/enums/blockchain.enum"
import { TON_BLOCK_TRACKING_INTERVAL } from "src/ton/constants"
import { JettonTransactionType } from "src/ton/enums/jetton-transaction-type.enum"
import { TonBlockchainProvider } from "src/ton/ton-blockchain.provider"
import { TonContractProvider } from "src/ton/ton-contract.provider"
import { WalletType } from "src/wallets/wallet.entity"
import { WalletsService } from "src/wallets/wallets.service"
import {
	ETH_SOURCE_SWAPS_QUEUE,
	GET_TON_MINT_TRANSACTION_JOB,
	MINT_TON_JETTONS_JOB,
	TON_DESTINATION_SWAPS_QUEUE,
	TOTAL_SWAP_CONFIRMATIONS,
	TRANSFER_ETH_FEE_JOB,
} from "../constants"
import { MintJettonsDto } from "../dto/mint-jettons.dto"
import { GetTransactionDto } from "../dto/get-transaction.dto"
import { TransferFeeDto } from "../dto/transfer-fee.dto"
import { SwapStatus } from "../enums/swap-status.enum"
import { SwapsService } from "../swaps.service"
import { TonBaseSwapsProcessor } from "./ton-base-swaps.processor"

@Processor(TON_DESTINATION_SWAPS_QUEUE)
export class TonDestinationSwapsProcessor extends TonBaseSwapsProcessor {
	private readonly logger = new Logger(TonDestinationSwapsProcessor.name)

	constructor(
		@Inject(CACHE_MANAGER) cacheManager: Cache,
		protected readonly tonBlockchain: TonBlockchainProvider,
		protected readonly tonContract: TonContractProvider,
		protected readonly swapsService: SwapsService,
		protected readonly eventsService: EventsService,
		protected readonly walletsService: WalletsService,
		@InjectQueue(TON_DESTINATION_SWAPS_QUEUE) private readonly destinationSwapsQueue: Queue,
		@InjectQueue(ETH_SOURCE_SWAPS_QUEUE) private readonly sourceSwapsQueue: Queue,
	) {
		super(
			cacheManager,
			"ton:dst",
			tonBlockchain,
			tonContract,
			swapsService,
			eventsService,
			walletsService,
		)
	}

	@Process(MINT_TON_JETTONS_JOB)
	async mintTonJettons(job: Job<MintJettonsDto>): Promise<SwapStatus> {
		const { data } = job
		this.logger.debug(`${data.swapId}: Start minting jetton`)

		const swap = await this.swapsService.findById(data.swapId)
		if (!swap) {
			this.logger.error(`${data.swapId}: Swap not found`)
			return SwapStatus.Failed
		}

		if (swap.expiresAt < new Date()) {
			await this.swapsService.update(swap.id, { status: SwapStatus.Expired })

			this.logger.error(`${swap.id}: Swap expired`)
			return SwapStatus.Expired
		}

		const minterAdminWallet = await this.walletsService.findRandomOne(
			Blockchain.TON,
			WalletType.Minter,
		)
		if (!minterAdminWallet) {
			this.logger.error(`${data.swapId}: Admin wallet of jetton minter not found`)
			return SwapStatus.Failed
		}

		const minterAdminWalletSigner = this.tonContract.createWalletSigner(
			minterAdminWallet.secretKey,
		)
		await this.tonContract.mintJettons(
			minterAdminWalletSigner,
			swap.destinationAddress,
			new BigNumber(swap.destinationAmount),
			new BigNumber(0.008),
			new BigNumber(0.02),
		)

		return SwapStatus.Confirmed
	}

	@OnQueueFailed({ name: MINT_TON_JETTONS_JOB })
	async onMintTonJettonsFailed(job: Job<MintJettonsDto>, err: Error): Promise<void> {
		const { data } = job
		this.logger.debug(`${data.swapId}: ${err.message}: Retrying...`)

		await this.destinationSwapsQueue.add(
			MINT_TON_JETTONS_JOB,
			{ swapId: data.swapId } as MintJettonsDto,
			{
				delay: TON_BLOCK_TRACKING_INTERVAL,
				priority: QUEUE_HIGH_PRIORITY,
			},
		)
	}

	@OnQueueCompleted({ name: MINT_TON_JETTONS_JOB })
	async onMintTonJettonsCompleted(
		job: Job<MintJettonsDto>,
		resultStatus: SwapStatus,
	): Promise<void> {
		const { data } = job
		if (!this.isSwapProcessable(resultStatus)) {
			this.emitEvent(data.swapId, resultStatus, 0)
			return
		}

		this.logger.log(`${data.swapId}: Jettons minted`)

		await this.destinationSwapsQueue.add(
			GET_TON_MINT_TRANSACTION_JOB,
			{ swapId: data.swapId } as GetTransactionDto,
			{
				delay: TON_BLOCK_TRACKING_INTERVAL,
				priority: QUEUE_HIGH_PRIORITY,
			},
		)
	}

	@Process(GET_TON_MINT_TRANSACTION_JOB)
	async getTonMintTransaction(job: Job<GetTransactionDto>): Promise<SwapStatus> {
		const { data } = job
		this.logger.debug(`${data.swapId}: Start getting mint transaction`)

		const swap = await this.swapsService.findById(data.swapId)
		if (!swap) {
			this.logger.error(`${data.swapId}: Swap not found`)
			return SwapStatus.Failed
		}

		if (swap.expiresAt < new Date()) {
			await this.swapsService.update(swap.id, { status: SwapStatus.Expired })

			this.logger.error(`${swap.id}: Swap expired`)
			return SwapStatus.Expired
		}

		const minterAdminWallet = await this.walletsService.findRandomOne(
			Blockchain.TON,
			WalletType.Minter,
		)
		if (!minterAdminWallet) {
			this.logger.error(`${data.swapId}: Admin wallet of jetton minter not found`)
			return SwapStatus.Failed
		}

		const jettonWalletAddress = await this.tonContract.getJettonWalletAddress(
			minterAdminWallet.address,
			swap.destinationAddress,
		)

		const incomingTransaction = await this.tonBlockchain.matchTransaction(
			jettonWalletAddress,
			swap.createdAt,
			JettonTransactionType.INCOMING,
		)

		await this.swapsService.update(swap.id, {
			destinationConjugatedAddress: this.tonBlockchain.normalizeAddress(jettonWalletAddress),
			destinationTransactionId: incomingTransaction.id,
			status: SwapStatus.Completed,
		})

		return SwapStatus.Completed
	}

	@OnQueueFailed({ name: GET_TON_MINT_TRANSACTION_JOB })
	async onGetTonMintTransactionFailed(job: Job<GetTransactionDto>, err: Error): Promise<void> {
		const { data } = job
		this.logger.debug(`${data.swapId}: ${err.message}: Retrying...`)

		await this.destinationSwapsQueue.add(
			GET_TON_MINT_TRANSACTION_JOB,
			{ swapId: data.swapId } as GetTransactionDto,
			{
				delay: TON_BLOCK_TRACKING_INTERVAL,
				priority: QUEUE_MEDIUM_PRIORITY,
			},
		)
	}

	@OnQueueCompleted({ name: GET_TON_MINT_TRANSACTION_JOB })
	async onGetTonMintTransactionCompleted(
		job: Job<GetTransactionDto>,
		resultStatus: SwapStatus,
	): Promise<void> {
		const { data } = job
		if (!this.isSwapProcessable(resultStatus)) {
			this.emitEvent(data.swapId, resultStatus, 0)
			return
		}

		this.emitEvent(data.swapId, SwapStatus.Completed, TOTAL_SWAP_CONFIRMATIONS)
		this.logger.log(`${data.swapId}: Mint transaction gotten`)

		await this.sourceSwapsQueue.add(
			TRANSFER_ETH_FEE_JOB,
			{ swapId: data.swapId } as TransferFeeDto,
			{ priority: QUEUE_LOW_PRIORITY },
		)
	}
}
