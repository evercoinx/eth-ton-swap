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
import { Blockchain, Token } from "src/tokens/token.entity"
import { JETTON_DECIMALS, TONCOIN_DECIMALS } from "src/ton/constants"
import { TokensService } from "src/tokens/tokens.service"
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
import { QueryContractDataPipe } from "./pipes/query-contract-data.pipe"
import { TransferPipe } from "./pipes/transfer.pipe"
import { QueryJettonWalletDataDto } from "./dto/query-jetton-wallet-data.dto"
import { JettonData } from "./interfaces/jetton-data.interface"

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
						adminWalletSigner.wallet.address,
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
	@Put(`${ContractType.JettonMinter}/mint`)
	async mintJettons(
		@Body(MintJettonsPipe) mintJettonsDto: MintJettonsDto,
	): Promise<GetTransactionResultDto> {
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

			const data = await this.tonContract.getJettonMinterData(
				adminWalletSigner.wallet.address,
			)
			this.logger.log(
				`Jetton minter at ${this.formatTonAddress(data.jettonMinterAddress)} minted ${
					mintJettonsDto.jettonAmount
				} jettons`,
			)
		}
		return {
			totalFee: totalFee?.toString(),
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
					transferDto.payload,
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
					transferDto.payload,
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
	@Get(`${ContractType.Wallet}/data`)
	async getWalletData(
		@Query(QueryContractDataPipe) queryContractDataDto: QueryContractDataDto,
	): Promise<GetWalletDataDto> {
		const data = await this.tonBlockchain.getWalletData(queryContractDataDto.address)

		return {
			isWallet: data.isWallet,
			address: this.formatTonAddress(data.address),
			balance: this.formatToncoins(data.balance),
			accountState: data.accountState,
			walletType: data.walletType,
			seqno: data.seqno,
		}
	}

	@UseGuards(JwtAuthGuard)
	@Get(`${ContractType.JettonMinter}/data`)
	async getJettonMinterData(
		@Query(QueryContractDataPipe) queryContractDataDto: QueryContractDataDto,
	): Promise<GetJettonMinterDataDto> {
		const token = await this.tokenService.findByBlockchainAndAddress(
			Blockchain.TON,
			queryContractDataDto.address,
		)
		if (!token) {
			throw new NotFoundException(`Token ${token.symbol} is not found`)
		}

		const data = await this.tonContract.getJettonMinterData(queryContractDataDto.address)

		return {
			totalSupply: this.formatJettons(token, data.totalSupply),
			jettonMinterAddress: this.formatTonAddress(data.jettonMinterAddress),
			jettonMinterBalance: this.formatToncoins(data.jettonMinterBalance),
			jettonContentUri: data.jettonContentUri,
			isMutable: data.isMutable,
			adminWalletAddress: this.formatTonAddress(data.adminWalletAddress),
			adminWalletBalance: this.formatToncoins(data.adminWalletBalance),
		}
	}

	@UseGuards(JwtAuthGuard)
	@Get(`${ContractType.JettonWallet}/data`)
	async getJettonWalletData(
		@Query() queryJettonWalletDataDto: QueryJettonWalletDataDto,
	): Promise<GetJettonWalletDataDto> {
		const jettons: JettonData[] = []

		for (const minterAdminAddress of queryJettonWalletDataDto.minterAdminAddresses) {
			const token = await this.tokenService.findByBlockchainAndAddress(
				Blockchain.TON,
				minterAdminAddress,
			)
			if (!token) {
				throw new NotFoundException(`Token ${token.symbol} is not found`)
			}

			let conjugatedAddress: Address
			let balance: BigNumber
			try {
				conjugatedAddress = await this.tonContract.getJettonWalletAddress(
					minterAdminAddress,
					queryJettonWalletDataDto.walletAddress,
				)

				const data = await this.tonContract.getJettonWalletData(conjugatedAddress)
				balance = data.balance
			} catch (err: unknown) {
				balance = new BigNumber(0)
			}

			jettons.push({
				balance: this.formatJettons(token, balance),
				conjugatedAddress: conjugatedAddress && this.formatTonAddress(conjugatedAddress),
			})
		}

		return {
			jettons,
		}
	}

	private formatTonAddress(address: Address): string {
		return address.toString(true, true, true)
	}

	private formatToncoins(amount: BigNumber): string {
		return `${amount.toFixed(TONCOIN_DECIMALS)} TON`
	}

	private formatJettons(token: Token, amount: BigNumber): string {
		return `${amount.toFixed(token.decimals)} ${token.symbol}`
	}
}
