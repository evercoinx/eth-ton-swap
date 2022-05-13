import { Body, Controller, Get, Logger, Post, Put, Query, UseGuards } from "@nestjs/common"
import BigNumber from "bignumber.js"
import { JwtAuthGuard } from "src/auth/guards/jwt-auth.guard"
import {
	ERROR_JETTON_MINTER_ADMIN_WALLET_NOT_FOUND,
	ERROR_TOKEN_NOT_FOUND,
	ERROR_WALLET_NOT_FOUND,
} from "src/common/constants"
import { Blockchain } from "src/common/enums/blockchain.enum"
import { NotFoundException } from "src/common/exceptions/not-found.exception"
import { Token } from "src/tokens/token.entity"
import { DEPLOY_JETTON_MINTER_GAS, JETTON_DECIMALS, TONCOIN_DECIMALS } from "src/ton/constants"
import { Quantity } from "src/common/providers/quantity"
import { TokensRepository } from "src/tokens/providers/tokens.repository"
import { WalletsRepository } from "src/wallets/providers/wallets.repository"
import { DeployJettonMinterDto } from "../dto/deploy-jetton-minter.dto"
import { GetJettonMinterDataDto } from "../dto/get-jetton-minter-data.dto"
import { GetTransactionResultDto } from "../dto/get-transaction-result.dto"
import { MintJettonsDto } from "../dto/mint-jettons.dto"
import { QueryContractDataDto } from "../dto/query-contract-data.dto"
import { DeployJettonMinterPipe } from "../pipes/deploy-jetton-minter.pipe"
import { MintJettonsPipe } from "../pipes/mint-jettons.pipe"
import { QueryContractDataPipe } from "../pipes/query-contract-data.pipe"
import { TonBlockchainService } from "../providers/ton-blockchain.service"
import { TonContractService } from "../providers/ton-contract.service"

@Controller("ton/minters")
export class MintersController {
	private readonly logger = new Logger(MintersController.name)

	constructor(
		private readonly tokensRepository: TokensRepository,
		private readonly walletsRepository: WalletsRepository,
		private readonly tonBlockchainService: TonBlockchainService,
		private readonly tonContractService: TonContractService,
	) {}

	@UseGuards(JwtAuthGuard)
	@Post()
	async deployMinter(
		@Body(DeployJettonMinterPipe) deployJettonMinterDto: DeployJettonMinterDto,
	): Promise<GetTransactionResultDto> {
		const adminWallet = await this.walletsRepository.findOne({
			blockchain: Blockchain.TON,
			address: deployJettonMinterDto.adminWalletAddress,
		})
		if (!adminWallet) {
			throw new NotFoundException(ERROR_JETTON_MINTER_ADMIN_WALLET_NOT_FOUND)
		}

		const adminWalletSigner = await this.tonContractService.createWalletSigner(
			adminWallet.secretKey,
		)

		const totalFee = await this.tonContractService.deployJettonMinter(
			adminWalletSigner,
			DEPLOY_JETTON_MINTER_GAS,
			deployJettonMinterDto.dryRun,
		)

		if (!deployJettonMinterDto.dryRun) {
			const jettonMinterData = await this.tonContractService.getJettonMinterData(
				adminWalletSigner.wallet.address,
			)

			const jettonMinterAddress = this.tonBlockchainService.normalizeAddress(
				jettonMinterData.jettonMinterAddress,
			)
			await this.walletsRepository.update(adminWallet.id, {
				conjugatedAddress: jettonMinterAddress,
				balance: new Quantity(0, TONCOIN_DECIMALS),
				deployed: true,
			})
			this.logger.log(`Jetton minter ${jettonMinterAddress} deployed`)
		}

		return { totalFee: totalFee?.toString() }
	}

	@UseGuards(JwtAuthGuard)
	@Put("mint")
	async mintJettons(
		@Body(MintJettonsPipe) mintJettonsDto: MintJettonsDto,
	): Promise<GetTransactionResultDto> {
		const adminWallet = await this.walletsRepository.findOne({
			blockchain: Blockchain.TON,
			address: mintJettonsDto.adminAddress,
		})
		if (!adminWallet) {
			throw new NotFoundException(ERROR_JETTON_MINTER_ADMIN_WALLET_NOT_FOUND)
		}

		const destinationWallet = await this.walletsRepository.findOne({
			blockchain: Blockchain.TON,
			address: mintJettonsDto.destinationAddress,
		})
		if (!destinationWallet) {
			throw new NotFoundException(ERROR_WALLET_NOT_FOUND)
		}

		const adminWalletSigner = await this.tonContractService.createWalletSigner(
			adminWallet.secretKey,
		)

		const totalFee = await this.tonContractService.mintJettons(
			adminWalletSigner,
			mintJettonsDto.destinationAddress,
			new BigNumber(mintJettonsDto.jettonAmount),
			new BigNumber(mintJettonsDto.transferAmount),
			new BigNumber(mintJettonsDto.mintTransferAmount),
			mintJettonsDto.dryRun,
		)

		if (!mintJettonsDto.dryRun) {
			const newBalance = new BigNumber(destinationWallet.balance).plus(
				mintJettonsDto.jettonAmount,
			)
			await this.walletsRepository.update(destinationWallet.id, {
				balance: new Quantity(newBalance, JETTON_DECIMALS),
			})

			const data = await this.tonContractService.getJettonMinterData(
				adminWalletSigner.wallet.address,
			)
			this.logger.log(
				`Jetton minter ${data.jettonMinterAddress} minted ${mintJettonsDto.jettonAmount} jettons`,
			)
		}

		return { totalFee: totalFee?.toString() }
	}

	@UseGuards(JwtAuthGuard)
	@Get("data")
	async getMinterData(
		@Query(QueryContractDataPipe) queryContractDataDto: QueryContractDataDto,
	): Promise<GetJettonMinterDataDto> {
		const token = await this.tokensRepository.findOne({
			blockchain: Blockchain.TON,
			address: queryContractDataDto.address,
		})
		if (!token) {
			throw new NotFoundException(ERROR_TOKEN_NOT_FOUND)
		}

		const data = await this.tonContractService.getJettonMinterData(queryContractDataDto.address)

		return {
			totalSupply: this.formatJettons(data.totalSupply, token),
			jettonMinterAddress: this.tonBlockchainService.normalizeAddress(
				data.jettonMinterAddress,
			),
			jettonMinterBalance: this.formatToncoins(data.jettonMinterBalance),
			jettonContentUri: data.jettonContentUri,
			isMutable: data.isMutable,
			adminWalletAddress: this.tonBlockchainService.normalizeAddress(data.adminWalletAddress),
			adminWalletBalance: this.formatToncoins(data.adminWalletBalance),
		}
	}

	private formatToncoins(amount: BigNumber): string {
		return `${amount.toFixed(TONCOIN_DECIMALS)} TON`
	}

	private formatJettons(amount: BigNumber, token: Token): string {
		return `${amount.toFixed(token.decimals)} ${token.symbol}`
	}
}
