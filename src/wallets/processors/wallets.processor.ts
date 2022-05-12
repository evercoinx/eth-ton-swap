import { InjectQueue, OnQueueCompleted, Process, Processor } from "@nestjs/bull"
import { Logger } from "@nestjs/common"
import BigNumber from "bignumber.js"
import { Job, Queue } from "bull"
import { ERROR_WALLET_NOT_FOUND } from "src/common/constants"
import { Quantity } from "src/common/providers/quantity"
import { DEPLOY_WALLET_GAS, TON_BLOCK_TRACKING_INTERVAL } from "src/ton/constants"
import { TonBlockchainService } from "src/ton/providers/ton-blockchain.service"
import { TonContractService } from "src/ton/providers/ton-contract.service"
import {
	CONFIRM_TONCOINS_TRANSFER_JOB,
	CONFIRM_WALLET_DEPLOY_JOB,
	DEPLOY_WALLET_ATTEMPTS,
	DEPLOY_WALLET_JOB,
	TRANSFER_TONCOINS_JOB,
	WALLETS_QUEUE,
} from "../constants"
import { ConfirmTransferDto } from "../dto/confirm-transfer.dto"
import { ConfirmWalletDeployDto } from "../dto/confirm-wallet-deploy.dto"
import { DeployWalletDto } from "../dto/deploy-wallet.dto"
import { TransferToncoinsDto } from "../dto/transfer-toncoins.dto"
import { WalletsRepository } from "../providers/wallets.repository"

@Processor(WALLETS_QUEUE)
export class WalletsProcessor {
	private readonly logger = new Logger(WalletsProcessor.name)

	constructor(
		@InjectQueue(WALLETS_QUEUE) private readonly walletsQueue: Queue,
		private readonly walletsRepository: WalletsRepository,
		private readonly tonBlockchainService: TonBlockchainService,
		private readonly tonContractService: TonContractService,
	) {}

	@Process(TRANSFER_TONCOINS_JOB)
	async transferToncoins(job: Job<TransferToncoinsDto>): Promise<boolean> {
		const { data } = job
		this.logger.debug(`${data.walletId}: Start transferring toncoins`)

		const wallet = await this.walletsRepository.findById(data.walletId)
		if (!wallet) {
			this.logger.error(`${data.walletId}: ${ERROR_WALLET_NOT_FOUND}`)
			return false
		}

		const giverWallet = await this.walletsRepository.findById(data.giverWalletId)
		if (!giverWallet) {
			this.logger.error(`${data.giverWalletId}: ${ERROR_WALLET_NOT_FOUND}`)
			return false
		}

		const giverWalletSigner = await this.tonContractService.createWalletSigner(
			giverWallet.secretKey,
		)

		await this.tonContractService.transfer(
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
		result: boolean,
	): Promise<void> {
		if (!result) {
			return
		}

		const { data } = job
		this.logger.log(`${data.walletId}: Toncoins transferred from giver ${data.giverWalletId}`)

		await this.walletsQueue.add(
			CONFIRM_TONCOINS_TRANSFER_JOB,
			{
				walletId: data.walletId,
				giverWalletId: data.giverWalletId,
			} as ConfirmTransferDto,
			{
				attempts: DEPLOY_WALLET_ATTEMPTS,
				delay: TON_BLOCK_TRACKING_INTERVAL,
				backoff: {
					type: "exponential",
					delay: TON_BLOCK_TRACKING_INTERVAL,
				},
			},
		)
	}

	@Process(CONFIRM_TONCOINS_TRANSFER_JOB)
	async confirmToncoinsTransfer(job: Job<ConfirmTransferDto>): Promise<boolean> {
		const { data } = job
		this.logger.debug(`${data.walletId}: Start confirming toncoins transfer`)

		const wallet = await this.walletsRepository.findById(data.walletId)
		if (!wallet) {
			this.logger.error(`${data.walletId}: ${ERROR_WALLET_NOT_FOUND}`)
			return false
		}

		const transaction = await this.tonBlockchainService.findTransaction(
			wallet.address,
			wallet.createdAt,
		)
		if (!transaction) {
			throw new Error("Toncoins transfer transaction not found")
		}
		return true
	}

	@OnQueueCompleted({ name: CONFIRM_TONCOINS_TRANSFER_JOB })
	async onConfirmToncoinsTransferCompleted(
		job: Job<ConfirmTransferDto>,
		result: boolean,
	): Promise<void> {
		if (!result) {
			return
		}

		const { data } = job
		this.logger.log(`${data.walletId}: Toncoins transfer confirmed`)

		await this.walletsQueue.add(
			DEPLOY_WALLET_JOB,
			{ walletId: data.walletId } as DeployWalletDto,
			{
				attempts: DEPLOY_WALLET_ATTEMPTS,
				backoff: {
					type: "exponential",
					delay: TON_BLOCK_TRACKING_INTERVAL,
				},
			},
		)
	}

	@Process(DEPLOY_WALLET_JOB)
	async deployWallet(job: Job<DeployWalletDto>): Promise<boolean> {
		const { data } = job
		this.logger.debug(`${data.walletId}: Start deploying wallet`)

		const wallet = await this.walletsRepository.findById(data.walletId)
		if (!wallet) {
			this.logger.error(`${data.walletId}: ${ERROR_WALLET_NOT_FOUND}`)
			return false
		}

		const walletSigner = await this.tonContractService.createWalletSigner(wallet.secretKey)

		await this.tonContractService.deployWallet(walletSigner)
		return true
	}

	@OnQueueCompleted({ name: DEPLOY_WALLET_JOB })
	async onDeployWalletCompleted(job: Job<ConfirmTransferDto>, result: boolean): Promise<void> {
		if (!result) {
			return
		}

		const { data } = job
		this.logger.log(`${data.walletId}: Wallet deployed`)

		await this.walletsQueue.add(
			CONFIRM_WALLET_DEPLOY_JOB,
			{ walletId: data.walletId } as ConfirmWalletDeployDto,
			{
				attempts: DEPLOY_WALLET_ATTEMPTS,
				delay: TON_BLOCK_TRACKING_INTERVAL,
				backoff: {
					type: "exponential",
					delay: TON_BLOCK_TRACKING_INTERVAL,
				},
			},
		)
	}

	@Process(CONFIRM_WALLET_DEPLOY_JOB)
	async confirmWalletDeploy(job: Job<ConfirmWalletDeployDto>): Promise<boolean> {
		const { data } = job
		this.logger.debug(`${data.walletId}: Start confirming wallet deploy`)

		const wallet = await this.walletsRepository.findById(data.walletId)
		if (!wallet) {
			this.logger.error(`${data.walletId}: ${ERROR_WALLET_NOT_FOUND}`)
			return false
		}

		const walletData = await this.tonBlockchainService.getWalletData(wallet.address)
		if (walletData.accountState !== "active") {
			throw new Error("Wallet inactive")
		}

		await this.walletsRepository.update(wallet.id, {
			balance: new Quantity(0, wallet.token.decimals),
			deployed: true,
		})
		return true
	}

	@OnQueueCompleted({ name: CONFIRM_WALLET_DEPLOY_JOB })
	async onConfirmWalletDeployCompleted(
		job: Job<ConfirmWalletDeployDto>,
		result: boolean,
	): Promise<void> {
		if (!result) {
			return
		}

		const { data } = job
		this.logger.log(`${data.walletId}: Wallet deploy confirmed`)
	}
}
