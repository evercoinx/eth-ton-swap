import {
	BadRequestException,
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
import { Address } from "tonweb/dist/types/utils/address"
import BigNumber from "bignumber.js"
import { JwtAuthGuard } from "src/auth/guards/jwt-auth.guard"
import { Blockchain } from "src/tokens/token.entity"
import { JETTON_DECIMALS, TONCOIN_DECIMALS } from "src/ton/constants"
import { JettonMinterData } from "src/ton/interfaces/jetton-minter-data.interface"
import { JettonWalletData } from "src/ton/interfaces/jetton-wallet-data.interface"
import { WalletData } from "src/ton/interfaces/wallet-data.interface"
import { WalletSigner } from "src/ton/interfaces/wallet-signer.interface"
import { TonContractProvider } from "src/ton/ton-contract.provider"
import { WalletsService } from "src/wallets/wallets.service"
import { DeployContractDto } from "./dto/deploy-contract.dto"
import { GetJettonMinterDataDto } from "./dto/get-jetton-minter-data.dto"
import { GetJettonWalletDataDto } from "./dto/get-jetton-wallet-data.dto"
import { GetTransactionResultDto } from "./dto/get-transaction-result.dto"
import { GetWalletDataDto } from "./dto/get-wallet-data.dto"
import { MintJettonsDto } from "./dto/mint-jettons.dto"
import { QueryContractDataDto } from "./dto/query-contract-data.dto"
import { TransferToncoinsDto } from "./dto/transfer-toncoins.dto"

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
		private readonly walletsService: WalletsService,
	) {}

	@UseGuards(JwtAuthGuard)
	@Post(":type")
	async deploy(
		@Param("type") contractType: ContractType,
		@Body() deployContractDto: DeployContractDto,
	): Promise<GetTransactionResultDto> {
		switch (contractType) {
			case ContractType.Wallet: {
				const wallet = await this.getWallet(deployContractDto.address)
				const totalFee = await this.tonContract.deployWallet(
					wallet,
					deployContractDto.dryRun,
				)

				if (!deployContractDto.dryRun) {
					const walletAddress = await wallet.wallet.getAddress()
					this.logger.log(`Wallet deployed at ${this.formatTonAddress(walletAddress)}`)
				}
				return {
					totalFee: totalFee?.toString(),
				}
			}

			case ContractType.JettonMinter: {
				const adminWallet = await this.getWallet(deployContractDto.address)
				const walletData = await this.tonContract.getWalletData(adminWallet)
				if (walletData.accountState !== "active") {
					throw new BadRequestException("Admin wallet is inactive yet")
				}

				const totalFee = await this.tonContract.deployJettonMinter(
					adminWallet,
					new BigNumber(deployContractDto.transferAmount),
					deployContractDto.dryRun,
				)

				if (!deployContractDto.dryRun) {
					const minterData = await this.tonContract.getJettonMinterData(adminWallet)
					this.logger.log(
						`Jetton minter deployed at ${this.formatTonAddress(
							minterData.jettonMinterAddress,
						)}`,
					)
				}
				return {
					totalFee: totalFee?.toString(),
				}
			}

			default:
				throw new BadRequestException("Invalid contract type")
		}
	}

	@UseGuards(JwtAuthGuard)
	@Put(":type/transfer")
	async transferToncoins(
		@Param("type") contractType: ContractType,
		@Body() transferToncoinsDto: TransferToncoinsDto,
	): Promise<GetTransactionResultDto> {
		switch (contractType) {
			case ContractType.Wallet: {
				const sourceWallet = await this.getWallet(transferToncoinsDto.sourceAddress)
				const totalFee = await this.tonContract.transfer(
					sourceWallet,
					transferToncoinsDto.destinationAddress,
					new BigNumber(transferToncoinsDto.amount),
					transferToncoinsDto.bounceable,
					undefined,
					undefined,
					transferToncoinsDto.dryRun,
				)

				if (!transferToncoinsDto.dryRun) {
					this.logger.log(
						`${transferToncoinsDto.amount} TON transferred from ${transferToncoinsDto.sourceAddress} ` +
							`to ${transferToncoinsDto.destinationAddress}`,
					)
				}
				return {
					totalFee: totalFee?.toString(),
				}
			}

			default:
				throw new BadRequestException("Invalid contract type")
		}
	}

	@UseGuards(JwtAuthGuard)
	@Put(":type/mint")
	async mintJettons(
		@Param("type") contractType: ContractType,
		@Body() mintJettonsDto: MintJettonsDto,
	): Promise<GetTransactionResultDto> {
		switch (contractType) {
			case ContractType.JettonMinter: {
				const adminWallet = await this.getWallet(mintJettonsDto.address)
				const totalFee = await this.tonContract.mintJettons(
					adminWallet,
					new BigNumber(mintJettonsDto.jettonAmount),
					new BigNumber(0.05),
					new BigNumber(0.04),
					mintJettonsDto.dryRun,
				)

				if (!mintJettonsDto.dryRun) {
					const data = await this.tonContract.getJettonMinterData(adminWallet)
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
				throw new BadRequestException("Invalid contract type")
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
				const wallet = await this.getWallet(queryContractDataDto.address)
				const data = await this.tonContract.getWalletData(wallet)
				return this.toGetWalletDataDto(data)
			}

			case ContractType.JettonMinter: {
				const adminWallet = await this.getWallet(queryContractDataDto.address)
				const data = await this.tonContract.getJettonMinterData(adminWallet)
				return this.toGetJettonMinterDataDto(data)
			}

			case ContractType.JettonWallet: {
				const wallet = await this.getWallet(queryContractDataDto.address)
				const data = await this.tonContract.getJettonWalletData(wallet)
				return this.toGetJettonWalletDataDto(data)
			}

			default:
				throw new BadRequestException("Invalid contract type")
		}
	}

	private async getWallet(address: string): Promise<WalletSigner> {
		const wallet = await this.walletsService.findOne(address)
		if (!wallet) {
			this.logger.log(`Wallet in ${Blockchain.TON} not found`)
			throw new NotFoundException(`Wallet in ${Blockchain.TON} is not found`)
		}

		return this.tonContract.createWallet(wallet.secretKey)
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
