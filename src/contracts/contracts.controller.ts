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
import { JwtAuthGuard } from "src/auth/guards/jwt-auth.guard"
import { Blockchain } from "src/tokens/token.entity"
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
				const minterData = await this.tonContract.deployMinter(
					adminWallet,
					deployMinterDto.transferAmount,
				)

				const minterAddress = minterData.minterAddress.toString(true, true, true)
				this.logger.log(`Minter contract deployed in ${Blockchain.TON} at ${minterAddress}`)

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
				const minterData = await this.tonContract.mintTokens(
					adminWallet,
					"0.05",
					mintMinterDto.tokenAmount,
					"0.04",
				)

				const minterAddress = minterData.minterAddress.toString(true, true, true)
				this.logger.log(`Minter contract deployed in ${Blockchain.TON} at ${minterAddress}`)

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
			totalSupply: minterData.totalSupply,
			minterAddress: minterData.minterAddress.toString(true, true, true),
			adminAddress: minterData.adminAddress.toString(true, true, true),
			jettonContentUri: minterData.jettonContentUri,
			isMutable: minterData.isMutable,
		}
	}
}
