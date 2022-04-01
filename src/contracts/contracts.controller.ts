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
import BigNumber from "bignumber.js"
import { JwtAuthGuard } from "src/auth/guards/jwt-auth.guard"
import { Blockchain } from "src/tokens/token.entity"
import { TONCOIN_DECIMALS, USDJ_DECIMALS } from "src/ton/constants"
import { MinterData } from "src/ton/interfaces/minter-data.interface"
import { WalletData } from "src/ton/interfaces/wallet-data.interface"
import { WalletSigner } from "src/ton/interfaces/wallet-signer.interface"
import { TonContractProvider } from "src/ton/ton-contract.provider"
import { WalletsService } from "src/wallets/wallets.service"
import { DeployContractDto } from "./dto/deploy-contract.dto"
import { GetTransactionResultDto } from "./dto/get-transaction-result.dto"
import { GetMinterDataDto } from "./dto/get-minter-data.dto"
import { GetWalletDataDto } from "./dto/get-wallet-data.dto"
import { MintTokensDto } from "./dto/mint-tokens.dto"
import { QueryContractDataDto } from "./dto/query-contract-data.dto"

enum ContractType {
	Wallet = "wallet",
	Minter = "minter",
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
					this.logger.log(
						`Wallet deployed at ${walletAddress.toString(true, true, true)}`,
					)
				}

				return {
					executed: !deployContractDto.dryRun,
					totalFee: totalFee.toString(),
				}
			}

			case ContractType.Minter: {
				const adminWallet = await this.getWallet(deployContractDto.address)
				const totalFee = await this.tonContract.deployMinter(
					adminWallet,
					new BigNumber(0.1),
					deployContractDto.dryRun,
				)

				if (!deployContractDto.dryRun) {
					const minterData = await this.tonContract.getMinterData(adminWallet)
					const minterAddress = minterData.minterAddress.toString(true, true, true)
					this.logger.log(`Minter deployed at ${minterAddress}`)
				}

				return {
					executed: !deployContractDto.dryRun,
					totalFee: totalFee.toString(),
				}
			}
		}

		throw new BadRequestException("Invalid contract type")
	}

	@UseGuards(JwtAuthGuard)
	@Put(":type/mint")
	async mintTokens(
		@Param("type") contractType: ContractType,
		@Body() mintTokensDto: MintTokensDto,
	): Promise<void> {
		switch (contractType) {
			case ContractType.Minter:
				const adminWallet = await this.getWallet(mintTokensDto.address)
				await this.tonContract.mintTokens(
					adminWallet,
					new BigNumber(mintTokensDto.tokenAmount),
					new BigNumber(0.05),
					new BigNumber(0.04),
				)

				const minterData = await this.tonContract.getMinterData(adminWallet)
				const minterAddress = minterData.minterAddress.toString(true, true, true)
				this.logger.log(
					`Minter at ${minterAddress} minted ${mintTokensDto.tokenAmount} jettons`,
				)
				return
		}

		throw new BadRequestException("Invalid contract type")
	}

	@UseGuards(JwtAuthGuard)
	@Get(":type")
	async getData(
		@Param("type") contractType: ContractType,
		@Query() queryContractDataDto: QueryContractDataDto,
	): Promise<GetWalletDataDto | GetMinterDataDto> {
		switch (contractType) {
			case ContractType.Wallet:
				const wallet = await this.getWallet(queryContractDataDto.address)
				const walletData = await this.tonContract.getWalletData(wallet)
				return this.toGetWalletDataDto(walletData)

			case ContractType.Minter:
				const adminWallet = await this.getWallet(queryContractDataDto.address)
				const minterData = await this.tonContract.getMinterData(adminWallet)
				return this.toGetMinterDataDto(minterData)
		}

		throw new BadRequestException("Invalid contract type")
	}

	private async getWallet(address: string): Promise<WalletSigner> {
		const wallet = await this.walletsService.findOne(address)
		if (!wallet) {
			this.logger.log(`Wallet in ${Blockchain.TON} not found`)
			throw new NotFoundException(`Wallet in ${Blockchain.TON} is not found`)
		}

		return this.tonContract.createWallet(wallet.secretKey)
	}

	private toGetWalletDataDto(walletData: WalletData): GetWalletDataDto {
		return {
			address: walletData.address.toString(true, true, true),
			balance: walletData.balance.toFixed(TONCOIN_DECIMALS, BigNumber.ROUND_DOWN),
			accountState: walletData.accountState,
			walletType: walletData.walletType,
			seqno: walletData.seqno,
		}
	}

	private toGetMinterDataDto(minterData: MinterData): GetMinterDataDto {
		return {
			totalSupply: minterData.totalSupply.toFixed(USDJ_DECIMALS, BigNumber.ROUND_DOWN),
			minterAddress: minterData.minterAddress.toString(true, true, true),
			minterBalance: minterData.minterBalance.toFixed(TONCOIN_DECIMALS, BigNumber.ROUND_DOWN),
			adminAddress: minterData.adminAddress.toString(true, true, true),
			adminBalance: minterData.adminBalance.toFixed(TONCOIN_DECIMALS, BigNumber.ROUND_DOWN),
			jettonContentUri: minterData.jettonContentUri,
			isMutable: minterData.isMutable,
		}
	}
}