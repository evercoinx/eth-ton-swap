import {
	BadRequestException,
	ConflictException,
	Body,
	Controller,
	Get,
	Logger,
	NotFoundException,
	Param,
	Post,
	Put,
	Query,
	UseGuards,
} from "@nestjs/common"
import BigNumber from "bignumber.js"
import { Address } from "tonweb/dist/types/utils/address"
import { JwtAuthGuard } from "src/auth/guards/jwt-auth.guard"
import { Blockchain } from "src/tokens/token.entity"
import { JETTON_DECIMALS, TONCOIN_DECIMALS } from "src/ton/constants"
import { JettonMinterData } from "src/ton/interfaces/jetton-minter-data.interface"
import { JettonWalletData } from "src/ton/interfaces/jetton-wallet-data.interface"
import { WalletData } from "src/ton/interfaces/wallet-data.interface"
import { TokensService } from "src/tokens/tokens.service"
import { TonBlockchainProvider } from "src/ton/ton-blockchain.provider"
import { TonContractProvider } from "src/ton/ton-contract.provider"
import { WalletsService } from "src/wallets/wallets.service"
import { WalletType } from "src/wallets/wallet.entity"
import { DeployContractDto } from "./dto/deploy-contract.dto"
import { GetJettonMinterDataDto } from "./dto/get-jetton-minter-data.dto"
import { GetJettonWalletAddressDto } from "./dto/get-jetton-wallet-address.dto"
import { GetJettonWalletDataDto } from "./dto/get-jetton-wallet-data.dto"
import { GetTransactionResultDto } from "./dto/get-transaction-result.dto"
import { GetWalletDataDto } from "./dto/get-wallet-data.dto"
import { MintJettonsDto } from "./dto/mint-jettons.dto"
import { QueryContractAddressDto } from "./dto/query-contract-address.dto"
import { QueryContractDataDto } from "./dto/query-contract-data.dto"
import { TransferDto } from "./dto/transfer.dto"
import { DeployContractPipe } from "./pipes/deploy-contract.pipe"
import { MintJettonsPipe } from "./pipes/mint-jettons.pipe"
import { QueryContractAddressPipe } from "./pipes/query-contract-address.pipe"
import { QueryContractDataPipe } from "./pipes/query-contract-data.pipe"
import { TransferPipe } from "./pipes/transfer.pipe"

enum ContractType {
	Wallet = "wallet",
	JettonMinter = "jetton-minter",
	JettonWallet = "jetton-wallet",
}

@Controller("ton")
export class TonController {
	private readonly logger = new Logger(TonController.name)

	constructor(
		private readonly tonBlockchain: TonBlockchainProvider,
		private readonly tonContract: TonContractProvider,
		private readonly tokenService: TokensService,
		private readonly walletsService: WalletsService,
	) {}

	@UseGuards(JwtAuthGuard)
	@Post(":type")
	async deployContract(
		@Param("type") contractType: ContractType,
		@Body(DeployContractPipe) deployContractDto: DeployContractDto,
	): Promise<GetTransactionResultDto> {
		switch (contractType) {
			case ContractType.Wallet: {
				const wallet = await this.walletsService.findByBlockchainAndAddress(
					Blockchain.TON,
					deployContractDto.address,
				)
				if (!wallet) {
					throw new NotFoundException("Wallet is not found")
				}

				const walletSigner = this.tonContract.createWalletSigner(wallet.secretKey)
				const totalFee = await this.tonContract.deployWallet(
					walletSigner,
					deployContractDto.dryRun,
				)

				if (!deployContractDto.dryRun) {
					await this.walletsService.update(wallet.id, {
						balance: "0",
						deployed: true,
					})
					this.logger.log(`Wallet ${wallet.address} deployed in ${Blockchain.TON}`)
				}
				return {
					totalFee: totalFee?.toString(),
				}
			}

			case ContractType.JettonMinter: {
				const adminWallet = await this.walletsService.findByBlockchainAndAddress(
					Blockchain.TON,
					deployContractDto.address,
				)
				if (!adminWallet) {
					throw new NotFoundException("Admin wallet is not found")
				}
				if (!adminWallet.deployed) {
					throw new ConflictException("Admin wallet has not been deployed yet")
				}

				const adminWalletSigner = this.tonContract.createWalletSigner(adminWallet.secretKey)
				const totalFee = await this.tonContract.deployJettonMinter(
					adminWalletSigner,
					new BigNumber(deployContractDto.transferAmount),
					deployContractDto.dryRun,
				)

				if (!deployContractDto.dryRun) {
					const jettonMinterData = await this.tonContract.getJettonMinterData(
						adminWalletSigner,
					)
					const jettonMinterAddress = this.tonBlockchain.normalizeAddress(
						jettonMinterData.jettonMinterAddress,
					)
					await this.walletsService.update(adminWallet.id, {
						conjugatedAddress: jettonMinterAddress,
						balance: "0",
						deployed: true,
					})
					this.logger.log(
						`Jetton minter ${jettonMinterAddress} deployed in ${Blockchain.TON}`,
					)
				}
				return {
					totalFee: totalFee?.toString(),
				}
			}

			default:
				throw new BadRequestException("Unexpected contract type")
		}
	}

	@UseGuards(JwtAuthGuard)
	@Put(":type/mint")
	async mintJettons(
		@Param("type") contractType: ContractType,
		@Body(MintJettonsPipe) mintJettonsDto: MintJettonsDto,
	): Promise<GetTransactionResultDto> {
		switch (contractType) {
			case ContractType.JettonMinter: {
				const adminWallet = await this.walletsService.findByBlockchainAndAddress(
					Blockchain.TON,
					mintJettonsDto.adminAddress,
				)
				if (!adminWallet) {
					throw new NotFoundException("Admin wallet is not found")
				}

				const destinationWallet = await this.walletsService.findByBlockchainAndAddress(
					Blockchain.TON,
					mintJettonsDto.destinationAddress,
				)
				if (!destinationWallet) {
					throw new NotFoundException("Destination wallet is not found")
				}

				const adminWalletSigner = this.tonContract.createWalletSigner(adminWallet.secretKey)
				const totalFee = await this.tonContract.mintJettons(
					adminWalletSigner,
					mintJettonsDto.destinationAddress,
					new BigNumber(mintJettonsDto.jettonAmount),
					new BigNumber(mintJettonsDto.transferAmount),
					new BigNumber(mintJettonsDto.mintTransferAmount),
					mintJettonsDto.dryRun,
				)

				if (!mintJettonsDto.dryRun) {
					const newBalance = new BigNumber(destinationWallet.balance)
						.plus(mintJettonsDto.jettonAmount)
						.toFixed(JETTON_DECIMALS)

					await this.walletsService.update(destinationWallet.id, {
						balance: newBalance,
					})

					const data = await this.tonContract.getJettonMinterData(adminWalletSigner)
					this.logger.log(
						`Jetton minter at ${this.formatTonAddress(
							data.jettonMinterAddress,
						)} minted ${mintJettonsDto.jettonAmount} jettons`,
					)
				}
				return {
					totalFee: totalFee?.toString(),
				}
			}

			default:
				throw new BadRequestException("Unexpected contract type")
		}
	}

	@UseGuards(JwtAuthGuard)
	@Put(":type/transfer")
	async transfer(
		@Param("type") contractType: ContractType,
		@Body(TransferPipe) transferDto: TransferDto,
	): Promise<GetTransactionResultDto> {
		switch (contractType) {
			case ContractType.Wallet: {
				const wallet = await this.walletsService.findByBlockchainAndAddress(
					Blockchain.TON,
					transferDto.sourceAddress,
				)
				if (!wallet) {
					throw new NotFoundException("Wallet is not found")
				}

				const walletSigner = this.tonContract.createWalletSigner(wallet.secretKey)
				const totalFee = await this.tonContract.transfer(
					walletSigner,
					transferDto.destinationAddress,
					new BigNumber(transferDto.amount),
					transferDto.bounceable,
					undefined,
					undefined,
					transferDto.dryRun,
				)

				if (!transferDto.dryRun) {
					this.logger.log(
						`${transferDto.amount} TON transferred from ${transferDto.sourceAddress} ` +
							`to ${transferDto.destinationAddress}`,
					)
				}
				return {
					totalFee: totalFee?.toString(),
				}
			}

			case ContractType.JettonWallet: {
				const token = await this.tokenService.findByBlockchainAndAddress(
					Blockchain.TON,
					transferDto.minterAdminAddress,
				)
				if (!token) {
					throw new NotFoundException("Token is not found")
				}

				const sourceWallet = await this.walletsService.findByBlockchainAndAddress(
					Blockchain.TON,
					transferDto.sourceAddress,
				)
				if (!sourceWallet) {
					throw new NotFoundException("Source wallet is not found")
				}

				const sourceWalletSigner = this.tonContract.createWalletSigner(
					sourceWallet.secretKey,
				)
				const totalFee = await this.tonContract.transferJettons(
					sourceWalletSigner,
					transferDto.minterAdminAddress,
					transferDto.destinationAddress,
					new BigNumber(transferDto.amount),
					new BigNumber(0.05),
					undefined,
					undefined,
					transferDto.dryRun,
				)

				if (!transferDto.dryRun) {
					this.logger.log(
						`${transferDto.amount} ${token.symbol} transferred from ${transferDto.sourceAddress} ` +
							`to ${transferDto.destinationAddress}`,
					)
				}
				return {
					totalFee: totalFee?.toString(),
				}
			}

			default:
				throw new BadRequestException("Unexpected contract type")
		}
	}

	@UseGuards(JwtAuthGuard)
	@Get(":type/data")
	async getContractData(
		@Param("type") contractType: ContractType,
		@Query(QueryContractDataPipe) queryContractDataDto: QueryContractDataDto,
	): Promise<GetWalletDataDto | GetJettonMinterDataDto | GetJettonWalletDataDto> {
		switch (contractType) {
			case ContractType.Wallet: {
				const walletSigner = this.tonContract.createVoidWalletSigner(
					queryContractDataDto.address,
				)
				const data = await this.tonContract.getWalletData(walletSigner)
				return this.toGetWalletDataDto(data)
			}

			case ContractType.JettonMinter: {
				const walletSigner = this.tonContract.createVoidWalletSigner(
					queryContractDataDto.address,
				)
				const data = await this.tonContract.getJettonMinterData(walletSigner)
				return this.toGetJettonMinterDataDto(data)
			}

			case ContractType.JettonWallet: {
				const walletSigner = this.tonContract.createVoidWalletSigner(
					queryContractDataDto.address,
				)
				const data = await this.tonContract.getJettonWalletData(walletSigner)
				return this.toGetJettonWalletDataDto(data)
			}

			default:
				throw new BadRequestException("Unexpected contract type")
		}
	}

	@UseGuards(JwtAuthGuard)
	@Get(":type/address")
	async getContractAddress(
		@Param("type") contractType: ContractType,
		@Query(QueryContractAddressPipe) queryContractAddressDto: QueryContractAddressDto,
	): Promise<GetJettonWalletAddressDto> {
		switch (contractType) {
			case ContractType.JettonWallet: {
				const walletSigner = this.tonContract.createVoidWalletSigner(
					queryContractAddressDto.adminWalletAddress,
				)
				const address = await this.tonContract.getJettonWalletAddress(
					walletSigner,
					queryContractAddressDto.ownerWalletAddress,
				)
				return {
					conjugatedAddress: this.formatTonAddress(address),
				}
			}

			default:
				throw new BadRequestException("Unexpected contract type")
		}
	}

	private formatTonAddress(address: Address): string {
		return address.toString(true, true, true)
	}

	private formatToncoins(amount: BigNumber): string {
		return `${amount.toFixed(TONCOIN_DECIMALS)} TON`
	}

	private formatJettons(amount: BigNumber): string {
		return `${amount.toFixed(JETTON_DECIMALS)} USDJ`
	}

	private toGetWalletDataDto(data: WalletData): GetWalletDataDto {
		return {
			isWallet: data.isWallet,
			address: this.formatTonAddress(data.address),
			balance: this.formatToncoins(data.balance),
			accountState: data.accountState,
			walletType: data.walletType,
			seqno: data.seqno,
		}
	}

	private toGetJettonMinterDataDto(data: JettonMinterData): GetJettonMinterDataDto {
		return {
			totalSupply: this.formatJettons(data.totalSupply),
			jettonMinterAddress: this.formatTonAddress(data.jettonMinterAddress),
			jettonMinterBalance: this.formatToncoins(data.jettonMinterBalance),
			jettonContentUri: data.jettonContentUri,
			isMutable: data.isMutable,
			adminWalletAddress: this.formatTonAddress(data.adminWalletAddress),
			adminWalletBalance: this.formatToncoins(data.adminWalletBalance),
		}
	}

	private toGetJettonWalletDataDto(data: JettonWalletData): GetJettonWalletDataDto {
		return {
			balance: this.formatJettons(data.balance),
			ownerAddress: this.formatTonAddress(data.ownerAddress),
			jettonMinterAddress: this.formatTonAddress(data.jettonMinterAddress),
		}
	}
}
