import {
	Body,
	Controller,
	Get,
	Logger,
	NotFoundException,
	Post,
	Put,
	Query,
	UseGuards,
} from "@nestjs/common"
import BigNumber from "bignumber.js"
import { JwtAuthGuard } from "src/auth/guards/jwt-auth.guard"
import {
	ERROR_JETTON_MINTER_ADMIN_WALLET_NOT_FOUND,
	ERROR_TOKEN_NOT_FOUND,
} from "src/common/constants"
import { Blockchain } from "src/common/enums/blockchain.enum"
import { Token } from "src/tokens/token.entity"
import { DEPLOY_JETTON_MINTER_GAS, TONCOIN_DECIMALS } from "src/ton/constants"
import { Quantity } from "src/common/providers/quantity"
import { TokensRepository } from "src/tokens/providers/tokens.repository"
import { WalletsRepository } from "src/wallets/providers/wallets.repository"
import { DeployJettonMinterDto } from "../dto/deploy-jetton-minter.dto"
import { GetJettonMinterDataDto } from "../dto/get-jetton-minter-data.dto"
import { GetTransactionResultDto } from "../dto/get-transaction-result.dto"
import { MintJettonsDto } from "../dto/mint-jettons.dto"
import { QueryJettonMinterDataDto } from "../dto/query-jetton-minter-data.dto"
import { DeployJettonMinterPipe } from "../pipes/deploy-jetton-minter.pipe"
import { MintJettonsPipe } from "../pipes/mint-jettons.pipe"
import { QueryJettonMinterDataPipe } from "../pipes/query-jetton-minter-data.pipe"
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

			await this.walletsRepository.update(adminWallet.id, {
				conjugatedAddress: this.tonBlockchainService.normalizeAddress(
					jettonMinterData.jettonMinterAddress,
				),
				balance: new Quantity(0, adminWallet.token.decimals),
			})
			this.logger.log(`${adminWallet.id}: Minter deployed`)
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

		const token = await this.tokensRepository.findOne({
			blockchain: Blockchain.TON,
			address: adminWallet.address,
		})
		if (!token) {
			throw new NotFoundException(ERROR_TOKEN_NOT_FOUND)
		}

		const adminWalletSigner = await this.tonContractService.createWalletSigner(
			adminWallet.secretKey,
		)

		const jettonAmount = new BigNumber(mintJettonsDto.jettonAmount)
		const totalFee = await this.tonContractService.mintJettons(
			adminWalletSigner,
			mintJettonsDto.destinationAddress,
			jettonAmount,
			new BigNumber(mintJettonsDto.transferAmount),
			new BigNumber(mintJettonsDto.mintTransferAmount),
			mintJettonsDto.dryRun,
		)

		if (!mintJettonsDto.dryRun) {
			this.logger.log(
				`${adminWallet.id}: Minter minted ${this.formatJettons(jettonAmount, token)} to ${
					mintJettonsDto.destinationAddress
				}`,
			)
		}

		return { totalFee: totalFee?.toString() }
	}

	@UseGuards(JwtAuthGuard)
	@Get("data")
	async getMinterData(
		@Query(QueryJettonMinterDataPipe) queryJettonMinterDataDto: QueryJettonMinterDataDto,
	): Promise<GetJettonMinterDataDto> {
		const token = await this.tokensRepository.findOne({
			blockchain: Blockchain.TON,
			address: queryJettonMinterDataDto.address,
		})
		if (!token) {
			throw new NotFoundException(ERROR_TOKEN_NOT_FOUND)
		}

		const data = await this.tonContractService.getJettonMinterData(
			queryJettonMinterDataDto.address,
		)

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
