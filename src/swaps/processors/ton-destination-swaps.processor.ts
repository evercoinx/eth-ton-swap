import { InjectQueue, OnQueueCompleted, Process, Processor } from "@nestjs/bull"
import { Logger } from "@nestjs/common"
import BigNumber from "bignumber.js"
import { Job, Queue } from "bull"
import {
	ATTEMPT_COUNT_EXTENDED,
	ATTEMPT_COUNT_ULTIMATE,
	QUEUE_HIGH_PRIORITY,
	QUEUE_LOW_PRIORITY,
} from "src/common/constants"
import { Blockchain } from "src/common/enums/blockchain.enum"
import { EventsService } from "src/common/providers/events.service"
import { ETH_BLOCK_TRACKING_INTERVAL } from "src/ethereum/constants"
import { MINT_JETTON_GAS, MINT_TRANSFER_GAS, TON_BLOCK_TRACKING_INTERVAL } from "src/ton/constants"
import { JettonOperation } from "src/ton/enums/jetton-operation.enum"
import { TonBlockchainService } from "src/ton/providers/ton-blockchain.service"
import { TonContractService } from "src/ton/providers/ton-contract.service"
import { WalletType } from "src/wallets/enums/wallet-type.enum"
import { WalletsRepository } from "src/wallets/providers/wallets.repository"
import {
	ETH_SOURCE_SWAPS_QUEUE,
	ETH_TOTAL_CONFIRMATIONS,
	GET_TON_MINT_TRANSACTION_JOB,
	MINT_TON_JETTONS_JOB,
	TON_DESTINATION_SWAPS_QUEUE,
	TRANSFER_ETH_FEE_JOB,
} from "../constants"
import { MintJettonsDto } from "../dto/mint-jettons.dto"
import { GetTransactionDto } from "../dto/get-transaction.dto"
import { TransferFeeDto } from "../dto/transfer-fee.dto"
import { SwapStatus } from "../enums/swap-status.enum"
import { SwapEvent } from "../interfaces/swap-event.interface"
import { SwapResult } from "../interfaces/swap-result.interface"
import { SwapsRepository } from "../providers/swaps.repository"
import { SwapsHelper } from "../providers/swaps.helper"

@Processor(TON_DESTINATION_SWAPS_QUEUE)
export class TonDestinationSwapsProcessor {
	private readonly logger = new Logger(TonDestinationSwapsProcessor.name)

	constructor(
		@InjectQueue(TON_DESTINATION_SWAPS_QUEUE) private readonly destinationSwapsQueue: Queue,
		@InjectQueue(ETH_SOURCE_SWAPS_QUEUE) private readonly sourceSwapsQueue: Queue,
		private readonly swapsRepository: SwapsRepository,
		private readonly walletsRepository: WalletsRepository,
		private readonly tonBlockchainService: TonBlockchainService,
		private readonly tonContractService: TonContractService,
		private readonly eventsService: EventsService,
		private readonly swapsHelper: SwapsHelper,
	) {}

	@Process(MINT_TON_JETTONS_JOB)
	async mintTonJettons(job: Job<MintJettonsDto>): Promise<SwapResult> {
		const { data } = job
		this.logger.debug(`${data.swapId}: Start minting jetton`)

		const swap = await this.swapsRepository.findById(data.swapId)
		if (!swap) {
			return this.swapsHelper.swapNotFound(data.swapId, this.logger)
		}

		if (swap.extendedExpiresAt < new Date()) {
			return await this.swapsHelper.swapExpired(swap, this.logger)
		}

		const minterAdminWallet = await this.walletsRepository.findBestMatchedOne({
			blockchain: Blockchain.TON,
			type: WalletType.Minter,
		})
		if (!minterAdminWallet) {
			return await this.swapsHelper.jettonMinterAdminWalletNotFound(swap, this.logger)
		}

		const minterAdminWalletSigner = await this.tonContractService.createWalletSigner(
			minterAdminWallet.secretKey,
		)

		await this.tonContractService.mintJettons(
			minterAdminWalletSigner,
			swap.destinationAddress,
			new BigNumber(swap.destinationAmount),
			MINT_TRANSFER_GAS,
			MINT_JETTON_GAS,
		)

		return this.swapsHelper.toSwapResult(SwapStatus.Confirmed)
	}

	@OnQueueCompleted({ name: MINT_TON_JETTONS_JOB })
	async onMintTonJettonsCompleted(job: Job<MintJettonsDto>, result: SwapResult): Promise<void> {
		const { data } = job
		const { status, statusCode } = result

		if (!this.swapsHelper.isSwapProcessable(result.status)) {
			this.eventsService.emit({
				status,
				statusCode,
				currentConfirmations: ETH_TOTAL_CONFIRMATIONS,
				totalConfirmations: ETH_TOTAL_CONFIRMATIONS,
			} as SwapEvent)
			return
		}

		this.logger.log(`${data.swapId}: Jettons minted`)

		await this.destinationSwapsQueue.add(
			GET_TON_MINT_TRANSACTION_JOB,
			{ swapId: data.swapId } as GetTransactionDto,
			{
				attempts: ATTEMPT_COUNT_EXTENDED,
				delay: TON_BLOCK_TRACKING_INTERVAL,
				priority: QUEUE_HIGH_PRIORITY,
				backoff: {
					type: "fixed",
					delay: TON_BLOCK_TRACKING_INTERVAL,
				},
			},
		)
	}

	@Process(GET_TON_MINT_TRANSACTION_JOB)
	async getTonMintTransaction(job: Job<GetTransactionDto>): Promise<SwapResult> {
		const { data } = job
		this.logger.debug(`${data.swapId}: Start finding mint transaction`)

		const swap = await this.swapsRepository.findById(data.swapId)
		if (!swap) {
			return this.swapsHelper.swapNotFound(data.swapId, this.logger)
		}

		if (swap.extendedExpiresAt < new Date()) {
			return await this.swapsHelper.swapExpired(swap, this.logger)
		}

		const minterAdminWallet = await this.walletsRepository.findBestMatchedOne({
			blockchain: Blockchain.TON,
			type: WalletType.Minter,
		})
		if (!minterAdminWallet) {
			return await this.swapsHelper.jettonMinterAdminWalletNotFound(swap, this.logger)
		}

		const jettonWalletAddress = await this.tonContractService.getJettonWalletAddress(
			minterAdminWallet.address,
			swap.destinationAddress,
		)

		const transaction = await this.tonBlockchainService.findTransaction(
			jettonWalletAddress,
			swap.createdAt,
			JettonOperation.INTERNAL_TRANSFER,
		)
		if (!transaction) {
			throw new Error("Mint transaction not found")
		}

		const result = this.swapsHelper.toSwapResult(SwapStatus.Completed)
		await this.swapsRepository.update(swap.id, {
			destinationConjugatedAddress:
				this.tonBlockchainService.normalizeAddress(jettonWalletAddress),
			destinationTransactionId: transaction.id,
			status: result.status,
			statusCode: result.statusCode,
		})

		return result
	}

	@OnQueueCompleted({ name: GET_TON_MINT_TRANSACTION_JOB })
	async onGetTonMintTransactionCompleted(
		job: Job<GetTransactionDto>,
		result: SwapResult,
	): Promise<void> {
		const { data } = job
		const { status, statusCode } = result

		if (!this.swapsHelper.isSwapProcessable(result.status)) {
			this.eventsService.emit({
				status,
				statusCode,
				currentConfirmations: ETH_TOTAL_CONFIRMATIONS,
				totalConfirmations: ETH_TOTAL_CONFIRMATIONS,
			} as SwapEvent)
			return
		}

		this.eventsService.emit({
			status,
			statusCode,
			currentConfirmations: ETH_TOTAL_CONFIRMATIONS,
			totalConfirmations: ETH_TOTAL_CONFIRMATIONS,
		} as SwapEvent)

		this.logger.log(`${data.swapId}: Mint transaction found`)

		await this.sourceSwapsQueue.add(
			TRANSFER_ETH_FEE_JOB,
			{ swapId: data.swapId } as TransferFeeDto,
			{
				attempts: ATTEMPT_COUNT_ULTIMATE,
				priority: QUEUE_LOW_PRIORITY,
				backoff: {
					type: "exponential",
					delay: ETH_BLOCK_TRACKING_INTERVAL,
				},
			},
		)
	}
}
