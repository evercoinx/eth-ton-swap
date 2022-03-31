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
	UseGuards,
} from "@nestjs/common"
import BigNumber from "bignumber.js"
import { JwtAuthGuard } from "src/auth/guards/jwt-auth.guard"
import { Blockchain } from "src/tokens/token.entity"
import { TONCOIN_DECIMALS, USDJ_DECIMALS } from "src/ton/constants"
import { MinterData } from "src/ton/interfaces/minter-data.interface"
import { WalletSigner } from "src/ton/interfaces/wallet-signer.interface"
import { TonContractProvider } from "src/ton/ton-contract.provider"
import { WalletType } from "src/wallets/wallet.entity"
import { WalletsService } from "src/wallets/wallets.service"
import { DeployMinterDto } from "./dto/deploy-minter.dto"
import { GetMinterDto } from "./dto/get-minter.dto"
import { MintMinterDto } from "./dto/mint-minter.dto"

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
	@Post(":type/deploy")
	async deploy(
		@Param("type") type: ContractType,
		@Body() deployMinterDto: DeployMinterDto,
	): Promise<GetMinterDto> {
		switch (type) {
			case ContractType.Minter:
				const adminWallet = await this.getMinterWallet()
				await this.tonContract.deployMinter(
					adminWallet,
					new BigNumber(deployMinterDto.transferAmount),
				)

				const minterData = await this.tonContract.getMinterData(adminWallet)
				const minterAddress = minterData.minterAddress.toString(true, true, true)
				this.logger.log(`Minter deployed at ${minterAddress}`)

				return this.toGetMinterDto(minterData)
		}

		throw new BadRequestException("Invalid contract type")
	}

	@UseGuards(JwtAuthGuard)
	@Put(":type/mint")
	async mint(
		@Param("type") type: ContractType,
		@Body() mintMinterDto: MintMinterDto,
	): Promise<GetMinterDto> {
		switch (type) {
			case ContractType.Minter:
				const adminWallet = await this.getMinterWallet()
				await this.tonContract.mintTokens(
					adminWallet,
					new BigNumber(mintMinterDto.tokenAmount),
					new BigNumber(0.05),
					new BigNumber(0.04),
				)

				const minterData = await this.tonContract.getMinterData(adminWallet)
				const minterAddress = minterData.minterAddress.toString(true, true, true)
				this.logger.log(
					`Minter at ${minterAddress} minted ${mintMinterDto.tokenAmount} jettons`,
				)

				return this.toGetMinterDto(minterData)
		}

		throw new BadRequestException("Invalid contract type")
	}

	@UseGuards(JwtAuthGuard)
	@Get(":type")
	async find(@Param("type") type: ContractType): Promise<GetMinterDto> {
		switch (type) {
			case ContractType.Minter:
				const adminWallet = await this.getMinterWallet()
				const minterData = await this.tonContract.getMinterData(adminWallet)

				return this.toGetMinterDto(minterData)
		}

		throw new BadRequestException("Invalid contract type")
	}

	private async getMinterWallet(): Promise<WalletSigner> {
		const wallet = await this.walletsService.findRandom(Blockchain.TON, WalletType.Minter)
		if (!wallet) {
			this.logger.log(`Available ${WalletType.Minter} wallet in ${Blockchain.TON} not found`)
			throw new NotFoundException(`Available wallet in ${Blockchain.TON} is not found`)
		}

		return this.tonContract.createWallet(wallet.secretKey)
	}

	private toGetMinterDto(minterData: MinterData): GetMinterDto {
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
