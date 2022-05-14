import { Body, Controller, Get, Logger, Post, Put, Query, UseGuards } from "@nestjs/common"
import BigNumber from "bignumber.js"
import { Address } from "tonweb/dist/types/utils/address"
import { JwtAuthGuard } from "src/auth/guards/jwt-auth.guard"
import { ERROR_TOKEN_NOT_FOUND, ERROR_WALLET_NOT_FOUND } from "src/common/constants"
import { Blockchain } from "src/common/enums/blockchain.enum"
import { NotFoundException } from "src/common/exceptions/not-found.exception"
import { Token } from "src/tokens/token.entity"
import { TONCOIN_DECIMALS } from "src/ton/constants"
import { Quantity } from "src/common/providers/quantity"
import { TokensRepository } from "src/tokens/providers/tokens.repository"
import { WalletsRepository } from "src/wallets/providers/wallets.repository"
import { BurnJettonsDto } from "../dto/burn-jettons.dto"
import { DeployWalletDto } from "../dto/deploy-wallet.dto"
import { GetJettonWalletDataDto } from "../dto/get-jetton-wallet-data.dto"
import { GetTransactionResultDto } from "../dto/get-transaction-result.dto"
import { GetWalletDataDto } from "../dto/get-wallet-data.dto"
import { QueryContractDataDto } from "../dto/query-contract-data.dto"
import { QueryJettonWalletDataDto } from "../dto/query-jetton-wallet-data.dto"
import { TransferJettonsDto } from "../dto/transfer-jettons.dto"
import { TransferToncoinsDto } from "../dto/transfer-toncoins dto"
import { JettonData } from "../interfaces/jetton-data.interface"
import { DeployWalletPipe } from "../pipes/deploy-wallet.pipe"
import { QueryContractDataPipe } from "../pipes/query-contract-data.pipe"
import { BurnJettonsPipe } from "../pipes/burn-jettons.pipe"
import { TransferJettonsPipe } from "../pipes/transfer-jettons.pipe"
import { TransferToncoinsPipe } from "../pipes/transfer-toncoins.pipe"
import { TonBlockchainService } from "../providers/ton-blockchain.service"
import { TonContractService } from "../providers/ton-contract.service"

@Controller("ton/wallets")
export class WalletsController {
	private readonly logger = new Logger(WalletsController.name)

	constructor(
		private readonly tokensRepository: TokensRepository,
		private readonly walletsRepository: WalletsRepository,
		private readonly tonBlockchainService: TonBlockchainService,
		private readonly tonContractService: TonContractService,
	) {}

	@UseGuards(JwtAuthGuard)
	@Post()
	async deployWallet(
		@Body(DeployWalletPipe) deployWalletDto: DeployWalletDto,
	): Promise<GetTransactionResultDto> {
		const wallet = await this.walletsRepository.findOne({
			blockchain: Blockchain.TON,
			address: deployWalletDto.address,
		})
		if (!wallet) {
			throw new NotFoundException(ERROR_WALLET_NOT_FOUND)
		}

		const walletSigner = await this.tonContractService.createWalletSigner(wallet.secretKey)

		const totalFee = await this.tonContractService.deployWallet(
			walletSigner,
			deployWalletDto.dryRun,
		)

		if (!deployWalletDto.dryRun) {
			await this.walletsRepository.update(wallet.id, {
				balance: new Quantity(0, wallet.token.decimals),
				deployed: true,
			})
			this.logger.log(`${wallet.id}: Wallet deployed`)
		}

		return { totalFee: totalFee?.toString() }
	}

	@UseGuards(JwtAuthGuard)
	@Put("transfer-toncoins")
	async transferToncoins(
		@Body(TransferToncoinsPipe) transferToncoinsDto: TransferToncoinsDto,
	): Promise<GetTransactionResultDto> {
		const wallet = await this.walletsRepository.findOne({
			blockchain: Blockchain.TON,
			address: transferToncoinsDto.sourceAddress,
		})
		if (!wallet) {
			throw new NotFoundException(ERROR_WALLET_NOT_FOUND)
		}

		const walletSigner = await this.tonContractService.createWalletSigner(wallet.secretKey)

		const amount = new BigNumber(transferToncoinsDto.amount)
		const totalFee = await this.tonContractService.transfer(
			walletSigner,
			transferToncoinsDto.destinationAddress,
			amount,
			transferToncoinsDto.bounceable,
			transferToncoinsDto.payload,
			undefined,
			transferToncoinsDto.dryRun,
		)

		if (!transferToncoinsDto.dryRun) {
			this.logger.log(
				`${this.formatToncoins(amount)} transferred from ${
					transferToncoinsDto.sourceAddress
				} ` + `to ${transferToncoinsDto.destinationAddress}`,
			)
		}

		return { totalFee: totalFee?.toString() }
	}

	@UseGuards(JwtAuthGuard)
	@Put("transfer-jettons")
	async transferJettons(
		@Body(TransferJettonsPipe) transferJettonsDto: TransferJettonsDto,
	): Promise<GetTransactionResultDto> {
		const token = await this.tokensRepository.findOne({
			blockchain: Blockchain.TON,
			address: transferJettonsDto.minterAdminWalletAddress,
		})
		if (!token) {
			throw new NotFoundException(ERROR_TOKEN_NOT_FOUND)
		}

		const sourceWallet = await this.walletsRepository.findOne({
			blockchain: Blockchain.TON,
			address: transferJettonsDto.sourceAddress,
		})
		if (!sourceWallet) {
			throw new NotFoundException(ERROR_WALLET_NOT_FOUND)
		}

		const sourceWalletSigner = await this.tonContractService.createWalletSigner(
			sourceWallet.secretKey,
		)

		const jettonAmount = new BigNumber(transferJettonsDto.jettonAmount)
		const totalFee = await this.tonContractService.transferJettons(
			sourceWalletSigner,
			transferJettonsDto.minterAdminWalletAddress,
			transferJettonsDto.destinationAddress,
			jettonAmount,
			new BigNumber(transferJettonsDto.transferAmount),
			undefined,
			transferJettonsDto.payload,
			transferJettonsDto.dryRun,
		)

		if (!transferJettonsDto.dryRun) {
			this.logger.log(
				`${this.formatJettons(jettonAmount, token)} transferred from ${
					transferJettonsDto.sourceAddress
				} ` + `to ${transferJettonsDto.destinationAddress}`,
			)
		}

		return { totalFee: totalFee?.toString() }
	}

	@UseGuards(JwtAuthGuard)
	@Put("burn-jettons")
	async burnJettons(
		@Body(BurnJettonsPipe) burnJettonsDto: BurnJettonsDto,
	): Promise<GetTransactionResultDto> {
		const token = await this.tokensRepository.findOne({
			blockchain: Blockchain.TON,
			address: burnJettonsDto.minterAdminWalletAddress,
		})
		if (!token) {
			throw new NotFoundException(ERROR_TOKEN_NOT_FOUND)
		}

		const ownerWallet = await this.walletsRepository.findOne({
			blockchain: Blockchain.TON,
			address: burnJettonsDto.ownerWalletAddress,
		})
		if (!ownerWallet) {
			throw new NotFoundException(ERROR_WALLET_NOT_FOUND)
		}

		const sourceWalletSigner = await this.tonContractService.createWalletSigner(
			ownerWallet.secretKey,
		)

		const totalFee = await this.tonContractService.burnJettons(
			sourceWalletSigner,
			burnJettonsDto.minterAdminWalletAddress,
			new BigNumber(burnJettonsDto.jettonAmount),
			new BigNumber(burnJettonsDto.transferAmount),
			burnJettonsDto.dryRun,
		)

		if (!burnJettonsDto.dryRun) {
			this.logger.log(
				`${burnJettonsDto.jettonAmount} jettons burned from ${burnJettonsDto.ownerWalletAddress}`,
			)
		}

		return { totalFee: totalFee?.toString() }
	}

	@UseGuards(JwtAuthGuard)
	@Get("data")
	async getWalletData(
		@Query(QueryContractDataPipe) queryContractDataDto: QueryContractDataDto,
	): Promise<GetWalletDataDto> {
		const data = await this.tonBlockchainService.getWalletData(queryContractDataDto.address)

		return {
			isWallet: data.isWallet,
			address: this.tonBlockchainService.normalizeAddress(data.address),
			balance: this.formatToncoins(data.balance),
			accountState: data.accountState,
			walletType: data.walletType,
			seqno: data.seqno,
		}
	}

	@UseGuards(JwtAuthGuard)
	@Get("jetton-data")
	async getJettonData(
		@Query() queryJettonWalletDataDto: QueryJettonWalletDataDto,
	): Promise<GetJettonWalletDataDto> {
		const jettons: JettonData[] = []

		for (const minterAdminAddress of queryJettonWalletDataDto.minterAdminAddresses) {
			const token = await this.tokensRepository.findOne({
				blockchain: Blockchain.TON,
				address: minterAdminAddress,
			})
			if (!token) {
				throw new NotFoundException(ERROR_TOKEN_NOT_FOUND)
			}

			let conjugatedAddress: Address = null
			let balance: BigNumber = null
			try {
				conjugatedAddress = await this.tonContractService.getJettonWalletAddress(
					minterAdminAddress,
					queryJettonWalletDataDto.walletAddress,
				)

				const data = await this.tonContractService.getJettonWalletData(conjugatedAddress)
				balance = data.balance
			} catch (err: unknown) {
				balance = new BigNumber(0)
			}

			jettons.push({
				address: this.tonBlockchainService.normalizeAddress(
					queryJettonWalletDataDto.walletAddress,
				),
				conjugatedAddress:
					conjugatedAddress &&
					this.tonBlockchainService.normalizeAddress(conjugatedAddress),
				balance: this.formatJettons(balance, token),
			})
		}

		return { jettons }
	}

	private formatToncoins(amount: BigNumber): string {
		return `${amount.toFixed(TONCOIN_DECIMALS)} TON`
	}

	private formatJettons(amount: BigNumber, token: Token): string {
		return `${amount.toFixed(token.decimals)} ${token.symbol}`
	}
}
