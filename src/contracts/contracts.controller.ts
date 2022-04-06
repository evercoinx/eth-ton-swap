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
import { TonBlockchainProvider } from "src/ton/ton-blockchain.provider"
import { TonContractProvider } from "src/ton/ton-contract.provider"
import { WalletsService } from "src/wallets/wallets.service"
import { DeployContractDto } from "./dto/deploy-contract.dto"
import { GetJettonMinterDataDto } from "./dto/get-jetton-minter-data.dto"
import { GetJettonWalletDataDto } from "./dto/get-jetton-wallet-data.dto"
import { GetTransactionResultDto } from "./dto/get-transaction-result.dto"
import { GetWalletDataDto } from "./dto/get-wallet-data.dto"
import { MintJettonsDto } from "./dto/mint-jettons.dto"
import { QueryContractDataDto } from "./dto/query-contract-data.dto"
import { TransferDto } from "./dto/transfer.dto"
import { DeployContractPipe } from "./pipes/deploy-contract.pipe"
import { MintJettonsPipe } from "./pipes/mint-jettons.pipe"
import { TransferPipe } from "./pipes/transfer.pipe"

enum ContractType {
	Wallet = "wallet",
	JettonMinter = "jetton-minter",
	JettonWallet = "jetton-wallet",
}

@Controller("contracts")
export class ContractsController {
	private readonly logger = new Logger(ContractsController.name)

	constructor(
		private readonly tonContract: TonContractProvider,
		private readonly tonBlockchain: TonBlockchainProvider,
		private readonly walletsService: WalletsService,
	) {}

	@UseGuards(JwtAuthGuard)
	@Post(":type")
	async deploy(
		@Param("type") contractType: ContractType,
		@Body(DeployContractPipe) deployContractDto: DeployContractDto,
	): Promise<GetTransactionResultDto> {
		switch (contractType) {
			case ContractType.Wallet: {
				const wallet = await this.walletsService.findByAddress(deployContractDto.address)
				if (!wallet) {
					throw new NotFoundException("Wallet is not found")
				}

				const walletSigner = this.tonContract.createWalletSigner(wallet.secretKey)
				const totalFee = await this.tonContract.deployWallet(
					walletSigner,
					deployContractDto.dryRun,
				)

				if (!deployContractDto.dryRun) {
					await this.walletsService.update({
						id: wallet.id,
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
				const adminWallet = await this.walletsService.findByAddress(
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
					await this.walletsService.update({
						id: adminWallet.id,
						relatedAddress: jettonMinterAddress,
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
	@Put(":type/transfer")
	async transfer(
		@Param("type") contractType: ContractType,
		@Body(TransferPipe) transferDto: TransferDto,
	): Promise<GetTransactionResultDto> {
		switch (contractType) {
			case ContractType.Wallet: {
				const wallet = await this.walletsService.findByAddress(transferDto.sourceAddress)
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
				const ownerWallet = await this.walletsService.findByAddress(
					transferDto.ownerAddress,
				)
				if (!ownerWallet) {
					throw new NotFoundException("Owner wallet is not found")
				}

				const destinationWallet = await this.walletsService.findByAddress(
					transferDto.destinationAddress,
				)
				if (!destinationWallet) {
					throw new NotFoundException("Destination wallet is not found")
				}

				const ownerWalletSigner = this.tonContract.createWalletSigner(ownerWallet.secretKey)
				const totalFee = await this.tonContract.transferJettons(
					ownerWalletSigner,
					transferDto.sourceAddress,
					transferDto.destinationAddress,
					new BigNumber(transferDto.amount),
					new BigNumber(0.1),
					undefined,
					undefined,
					transferDto.dryRun,
				)

				if (!transferDto.dryRun) {
					this.logger.log(
						`${transferDto.amount} USDJ transferred from ${transferDto.sourceAddress} ` +
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
	@Put(":type/mint")
	async mintJettons(
		@Param("type") contractType: ContractType,
		@Body(MintJettonsPipe) mintJettonsDto: MintJettonsDto,
	): Promise<GetTransactionResultDto> {
		switch (contractType) {
			case ContractType.JettonMinter: {
				const adminWallet = await this.walletsService.findByAddress(
					mintJettonsDto.adminAddress,
				)
				if (!adminWallet) {
					throw new NotFoundException("Admin wallet is not found")
				}

				const destinationWallet = await this.walletsService.findByAddress(
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
					await this.walletsService.update({
						id: destinationWallet.id,
						balance: new BigNumber(destinationWallet.balance)
							.plus(mintJettonsDto.jettonAmount)
							.toFixed(JETTON_DECIMALS, BigNumber.ROUND_DOWN),
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
	@Get(":type")
	async getData(
		@Param("type") contractType: ContractType,
		@Query() queryContractDataDto: QueryContractDataDto,
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

	private formatTonAddress(address: Address): string {
		return address.toString(true, true, true)
	}

	private formatToncoins(amount: BigNumber): string {
		return `${amount.toFixed(TONCOIN_DECIMALS, BigNumber.ROUND_DOWN)} TON`
	}

	private formatJettons(amount: BigNumber): string {
		return `${amount.toFixed(JETTON_DECIMALS, BigNumber.ROUND_DOWN)} USDJ`
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
