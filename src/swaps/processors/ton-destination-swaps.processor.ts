import { InjectQueue, OnQueueCompleted, Process, Processor } from "@nestjs/bull"
import { Logger } from "@nestjs/common"
import BigNumber from "bignumber.js"
import { Job, Queue } from "bull"
import { QUEUE_HIGH_PRIORITY, QUEUE_LOW_PRIORITY } from "src/common/constants"
import { Blockchain } from "src/common/enums/blockchain.enum"
import { EventsService } from "src/common/events.service"
import { ETH_BLOCK_TRACKING_INTERVAL } from "src/ethereum/constants"
import { MINT_JETTON_GAS, MINT_TRANSFER_GAS, TON_BLOCK_TRACKING_INTERVAL } from "src/ton/constants"
import { TransactionType } from "src/ton/enums/transaction-type.enum"
import { TonBlockchainProvider } from "src/ton/ton-blockchain.provider"
import { TonContractProvider } from "src/ton/ton-contract.provider"
import { WalletType } from "src/wallets/enums/wallet-type.enum"
import { WalletsService } from "src/wallets/wallets.service"
import {
	ETH_SOURCE_SWAPS_QUEUE,
	ETH_TOTAL_SWAP_CONFIRMATIONS,
	GET_TON_MINT_TRANSACTION_JOB,
	MINT_TON_JETTONS_JOB,
	TON_DESTINATION_SWAPS_QUEUE,
	TRANSFER_ETH_FEE_JOB,
} from "../constants"
import { MintJettonsDto } from "../dto/mint-jettons.dto"
import { GetTransactionDto } from "../dto/get-transaction.dto"
import { TransferFeeDto } from "../dto/transfer-fee.dto"
import { SwapStatus } from "../enums/swap-status.enum"
import { SwapsService } from "../swaps.service"
import { BaseSwapsProcessor } from "./base-swaps.processor"

@Processor(TON_DESTINATION_SWAPS_QUEUE)
export class TonDestinationSwapsProcessor extends BaseSwapsProcessor {
	private readonly logger = new Logger(TonDestinationSwapsProcessor.name)

	constructor(
		protected readonly eventsService: EventsService,
		@InjectQueue(TON_DESTINATION_SWAPS_QUEUE) private readonly destinationSwapsQueue: Queue,
		@InjectQueue(ETH_SOURCE_SWAPS_QUEUE) private readonly sourceSwapsQueue: Queue,
		private readonly tonBlockchain: TonBlockchainProvider,
		private readonly tonContract: TonContractProvider,
		private readonly swapsService: SwapsService,
		private readonly walletsService: WalletsService,
	) {
		super(eventsService)
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

		if (swap.extendedExpiresAt < new Date()) {
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
			MINT_TRANSFER_GAS,
			MINT_JETTON_GAS,
		)

		return SwapStatus.Confirmed
	}

	@OnQueueCompleted({ name: MINT_TON_JETTONS_JOB })
	async onMintTonJettonsCompleted(job: Job<MintJettonsDto>, result: SwapStatus): Promise<void> {
		const { data } = job
		if (!this.isSwapProcessable(result)) {
			this.emitEvent(
				data.swapId,
				result,
				ETH_TOTAL_SWAP_CONFIRMATIONS,
				ETH_TOTAL_SWAP_CONFIRMATIONS,
			)
			return
		}

		this.logger.log(`${data.swapId}: Jettons minted`)

		await this.destinationSwapsQueue.add(
			GET_TON_MINT_TRANSACTION_JOB,
			{ swapId: data.swapId } as GetTransactionDto,
			{
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
	async getTonMintTransaction(job: Job<GetTransactionDto>): Promise<SwapStatus> {
		const { data } = job
		this.logger.debug(`${data.swapId}: Start getting mint transaction`)

		const swap = await this.swapsService.findById(data.swapId)
		if (!swap) {
			this.logger.error(`${data.swapId}: Swap not found`)
			return SwapStatus.Failed
		}

		if (swap.extendedExpiresAt < new Date()) {
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

		const incomingTransaction = await this.tonBlockchain.findTransaction(
			jettonWalletAddress,
			swap.createdAt,
			TransactionType.INCOMING,
		)
		if (!incomingTransaction) {
			throw new Error("Mint transaction not found")
		}

		await this.swapsService.update(swap.id, {
			destinationConjugatedAddress: this.tonBlockchain.normalizeAddress(jettonWalletAddress),
			destinationTransactionId: incomingTransaction.id,
			status: SwapStatus.Completed,
		})

		return SwapStatus.Completed
	}

	@OnQueueCompleted({ name: GET_TON_MINT_TRANSACTION_JOB })
	async onGetTonMintTransactionCompleted(
		job: Job<GetTransactionDto>,
		result: SwapStatus,
	): Promise<void> {
		const { data } = job
		if (!this.isSwapProcessable(result)) {
			this.emitEvent(
				data.swapId,
				result,
				ETH_TOTAL_SWAP_CONFIRMATIONS,
				ETH_TOTAL_SWAP_CONFIRMATIONS,
			)
			return
		}

		this.emitEvent(
			data.swapId,
			SwapStatus.Completed,
			ETH_TOTAL_SWAP_CONFIRMATIONS,
			ETH_TOTAL_SWAP_CONFIRMATIONS,
		)
		this.logger.log(`${data.swapId}: Mint transaction found`)

		await this.sourceSwapsQueue.add(
			TRANSFER_ETH_FEE_JOB,
			{ swapId: data.swapId } as TransferFeeDto,
			{
				priority: QUEUE_LOW_PRIORITY,
				backoff: {
					type: "exponential",
					delay: ETH_BLOCK_TRACKING_INTERVAL,
				},
			},
		)
	}
}
