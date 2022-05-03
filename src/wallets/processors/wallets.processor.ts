import { InjectQueue, OnQueueCompleted, Process, Processor } from "@nestjs/bull"
import { Logger } from "@nestjs/common"
import BigNumber from "bignumber.js"
import { Job, Queue } from "bull"
import { DEPLOY_WALLET_GAS, TON_BLOCK_TRACKING_INTERVAL } from "src/ton/constants"
import { TonBlockchainProvider } from "src/ton/ton-blockchain.provider"
import { TonContractProvider } from "src/ton/ton-contract.provider"
import {
	CONFIRM_TRANSFER_JOB,
	DEPLOY_WALLET_JOB,
	TRANSFER_TONCOINS_JOB,
	WALLETS_QUEUE,
	DEPLOY_WALLET_ATTEMPTS,
} from "../constants"
import { ConfirmTransferDto } from "../dto/confirm-transfer.dto"
import { DeployWalletDto } from "../dto/deploy-wallet.dto"
import { TransferToncoinsDto } from "../dto/transfer-toncoins.dto"
import { WalletsService } from "../wallets.service"

@Processor(WALLETS_QUEUE)
export class WalletsProcessor {
	private readonly logger = new Logger(WalletsProcessor.name)

	constructor(
		private readonly tonBlockchain: TonBlockchainProvider,
		private readonly tonContract: TonContractProvider,
		private readonly walletsService: WalletsService,
		@InjectQueue(WALLETS_QUEUE) private readonly walletsQueue: Queue,
	) {}

	@Process(TRANSFER_TONCOINS_JOB)
	async transferToncoins(job: Job<TransferToncoinsDto>): Promise<boolean> {
		const { data } = job
		this.logger.debug(`${data.walletId}: Start transferring toncoins`)

		const wallet = await this.walletsService.findById(data.walletId)
		if (!wallet) {
			this.logger.error(`${data.walletId}: Wallet not found`)
			return false
		}

		const giverWallet = await this.walletsService.findById(data.giverWalletId)
		if (!giverWallet) {
			this.logger.error(`${data.walletId}: Giver wallet not found`)
			return false
		}

		const giverWalletSigner = this.tonContract.createWalletSigner(giverWallet.secretKey)
		await this.tonContract.transfer(
			giverWalletSigner,
			wallet.address,
			new BigNumber(DEPLOY_WALLET_GAS),
			false,
		)
		return true
	}

	@OnQueueCompleted({ name: TRANSFER_TONCOINS_JOB })
	async onTransferToncoinsCompleted(
		job: Job<TransferToncoinsDto>,
		resultStatus: boolean,
	): Promise<void> {
		if (!resultStatus) {
			return
		}

		const { data } = job
		this.logger.log(`${data.walletId}: Toncoins transferred from ${data.giverWalletId}`)

		await this.walletsQueue.add(
			CONFIRM_TRANSFER_JOB,
			{
				walletId: data.walletId,
				giverWalletId: data.giverWalletId,
			} as ConfirmTransferDto,
			{
				attempts: DEPLOY_WALLET_ATTEMPTS,
				backoff: {
					type: "fixed",
					delay: TON_BLOCK_TRACKING_INTERVAL,
				},
			},
		)
	}

	@Process(CONFIRM_TRANSFER_JOB)
	async confirmTransfer(job: Job<ConfirmTransferDto>): Promise<boolean> {
		const { data } = job
		this.logger.debug(`${data.walletId}: Start confirming transfer`)

		const wallet = await this.walletsService.findById(data.walletId)
		if (!wallet) {
			this.logger.error(`${data.walletId}: Wallet not found`)
			return false
		}

		await this.tonBlockchain.matchTransaction(wallet.address, wallet.createdAt)
		return true
	}

	@OnQueueCompleted({ name: CONFIRM_TRANSFER_JOB })
	async onConfirmTransferCompleted(
		job: Job<ConfirmTransferDto>,
		resultStatus: boolean,
	): Promise<void> {
		if (!resultStatus) {
			return
		}

		const { data } = job
		this.logger.log(`${data.walletId}: Toncoin transfer confirmed`)

		await this.walletsQueue.add(
			DEPLOY_WALLET_JOB,
			{
				walletId: data.walletId,
			} as DeployWalletDto,
			{
				attempts: DEPLOY_WALLET_ATTEMPTS,
				backoff: {
					type: "fixed",
					delay: TON_BLOCK_TRACKING_INTERVAL,
				},
			},
		)
	}

	@Process(DEPLOY_WALLET_JOB)
	async deployWallet(job: Job<DeployWalletDto>): Promise<boolean> {
		const { data } = job
		this.logger.debug(`${data.walletId}: Start deploying wallet`)

		const wallet = await this.walletsService.findById(data.walletId)
		if (!wallet) {
			this.logger.error(`${data.walletId}: Wallet not found`)
			return false
		}

		const walletSigner = this.tonContract.createWalletSigner(wallet.secretKey)
		await this.tonContract.deployWallet(walletSigner)

		await this.walletsService.update(wallet.id, {
			balance: "0",
			deployed: true,
		})
		return true
	}

	@OnQueueCompleted({ name: DEPLOY_WALLET_JOB })
	async onDeployWaletCompleted(
		job: Job<ConfirmTransferDto>,
		resultStatus: boolean,
	): Promise<void> {
		if (!resultStatus) {
			return
		}

		const { data } = job
		this.logger.log(`${data.walletId}: Wallet deployed`)
	}
}
