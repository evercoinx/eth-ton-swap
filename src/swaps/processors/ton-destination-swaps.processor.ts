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
import { EventsService } from "src/common/events.service"
import { ETH_BLOCK_TRACKING_INTERVAL } from "src/ethereum/constants"
import { MINT_JETTON_GAS, MINT_TRANSFER_GAS, TON_BLOCK_TRACKING_INTERVAL } from "src/ton/constants"
import { JettonOperation } from "src/ton/enums/jetton-operation.enum"
import { TonBlockchainProvider } from "src/ton/ton-blockchain.provider"
import { TonContractProvider } from "src/ton/ton-contract.provider"
import { WalletType } from "src/wallets/enums/wallet-type.enum"
import { WalletsService } from "src/wallets/wallets.service"
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
import { getNonProcessableSwapStatuses, SwapStatus } from "../enums/swap-status.enum"
import { SwapEvent } from "../interfaces/swap-event.interface"
import { SwapResult, toSwapResult } from "../interfaces/swap-result.interface"
import { SwapsService } from "../swaps.service"

@Processor(TON_DESTINATION_SWAPS_QUEUE)
export class TonDestinationSwapsProcessor {
	private readonly logger = new Logger(TonDestinationSwapsProcessor.name)

	constructor(
		@InjectQueue(TON_DESTINATION_SWAPS_QUEUE) private readonly destinationSwapsQueue: Queue,
		@InjectQueue(ETH_SOURCE_SWAPS_QUEUE) private readonly sourceSwapsQueue: Queue,
		private readonly tonBlockchain: TonBlockchainProvider,
		private readonly tonContract: TonContractProvider,
		private readonly eventsService: EventsService,
		private readonly swapsService: SwapsService,
		private readonly walletsService: WalletsService,
	) {}

	@Process(MINT_TON_JETTONS_JOB)
	async mintTonJettons(job: Job<MintJettonsDto>): Promise<SwapResult> {
		const { data } = job
		this.logger.debug(`${data.swapId}: Start minting jetton`)

		const swap = await this.swapsService.findById(data.swapId)
		if (!swap) {
			this.logger.error(`${data.swapId}: Swap not found`)
			return toSwapResult(SwapStatus.Failed, "Swap not found")
		}

		if (swap.extendedExpiresAt < new Date()) {
			const result = toSwapResult(SwapStatus.Expired, "Swap expired")
			await this.swapsService.update(swap.id, {
				status: result.status,
				statusCode: result.statusCode,
			})

			await this.walletsService.update(swap.sourceWallet.id, { inUse: false })

			this.logger.error(`${swap.id}: Swap expired`)
			return result
		}

		const minterAdminWallet = await this.walletsService.findRandomOne(
			Blockchain.TON,
			WalletType.Minter,
		)
		if (!minterAdminWallet) {
			const result = toSwapResult(
				SwapStatus.Failed,
				"Admin wallet of jetton minter not found",
			)
			await this.swapsService.update(swap.id, {
				status: result.status,
				statusCode: result.statusCode,
			})

			await this.walletsService.update(swap.sourceWallet.id, { inUse: false })

			this.logger.error(`${data.swapId}: Admin wallet of jetton minter not found`)
			return result
		}

		const minterAdminWalletSigner = this.tonContract.createWalletSigner(
			minterAdminWallet.secretKey,
		)
		await this.tonContract.mintJettons(
			minterAdminWalletSigner,
			swap.destinationAddress,
			new BigNumber(swap.destinationAmount),
			MINT_TRANSFER_GAS,
			MINT_JETTON_GAS,
		)

		return toSwapResult(SwapStatus.Confirmed)
	}

	@OnQueueCompleted({ name: MINT_TON_JETTONS_JOB })
	async onMintTonJettonsCompleted(job: Job<MintJettonsDto>, result: SwapResult): Promise<void> {
		const { data } = job
		const { status, statusCode } = result

		if (getNonProcessableSwapStatuses().includes(result.status)) {
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

		const swap = await this.swapsService.findById(data.swapId)
		if (!swap) {
			this.logger.error(`${data.swapId}: Swap not found`)
			return toSwapResult(SwapStatus.Failed, "Swap not found")
		}

		if (swap.extendedExpiresAt < new Date()) {
			const result = toSwapResult(SwapStatus.Expired, "Swap expired")
			await this.swapsService.update(swap.id, {
				status: result.status,
				statusCode: result.statusCode,
			})

			await this.walletsService.update(swap.sourceWallet.id, { inUse: false })

			this.logger.error(`${swap.id}: Swap expired`)
			return result
		}

		const minterAdminWallet = await this.walletsService.findRandomOne(
			Blockchain.TON,
			WalletType.Minter,
		)
		if (!minterAdminWallet) {
			const result = toSwapResult(
				SwapStatus.Failed,
				"Admin wallet of jetton minter not found",
			)
			await this.swapsService.update(swap.id, {
				status: result.status,
				statusCode: result.statusCode,
			})

			await this.walletsService.update(swap.sourceWallet.id, { inUse: false })

			this.logger.error(`${data.swapId}: Admin wallet of jetton minter not found`)
			return result
		}

		const jettonWalletAddress = await this.tonContract.getJettonWalletAddress(
			minterAdminWallet.address,
			swap.destinationAddress,
		)

		const transaction = await this.tonBlockchain.findTransaction(
			jettonWalletAddress,
			swap.createdAt,
			JettonOperation.INTERNAL_TRANSFER,
		)
		if (!transaction) {
			throw new Error("Mint transaction not found")
		}

		const result = toSwapResult(SwapStatus.Completed)
		await this.swapsService.update(swap.id, {
			destinationConjugatedAddress: this.tonBlockchain.normalizeAddress(jettonWalletAddress),
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

		if (getNonProcessableSwapStatuses().includes(result.status)) {
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
