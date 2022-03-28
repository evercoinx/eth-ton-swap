import {
	BadRequestException,
	Controller,
	Get,
	Logger,
	NotFoundException,
	Param,
	Post,
	UseGuards,
} from "@nestjs/common"
import { JwtAuthGuard } from "src/auth/guards/jwt-auth.guard"
import { Blockchain } from "src/tokens/token.entity"
import { MinterInfo } from "src/ton/interfaces/minter-info.interface"
import { TonService } from "src/ton/ton.service"
import { WalletType } from "src/wallets/wallet.entity"
import { WalletsService } from "src/wallets/wallets.service"
import { GetMinterDto } from "./dto/get-minter.dto"

@Controller("contracts")
export class ContractsController {
	private readonly logger = new Logger(ContractsController.name)

	constructor(
		private readonly tonService: TonService,
		private readonly walletsService: WalletsService,
	) {}

	@UseGuards(JwtAuthGuard)
	@Post(":type/deploy")
	async deploy(@Param("type") type: string): Promise<GetMinterDto> {
		if (type !== "minter") {
			throw new BadRequestException("Invalid contract type")
		}

		const wallet = await this.walletsService.findRandom(Blockchain.TON, WalletType.Minter)
		if (!wallet) {
			this.logger.log(
				`Available ${WalletType.Collector} wallet in ${Blockchain.TON} not found`,
			)
			throw new NotFoundException(`Available wallet in ${Blockchain.TON} is not found`)
		}

		const tonWallet = this.tonService.createWallet(wallet.secretKey)
		const minterInfo = await this.tonService.deployMinterContract(tonWallet, "0.1")

		const minterAddress = minterInfo.minterAddress.toString(true, true, true)
		this.logger.log(`Minter contract deployed in ${Blockchain.TON} at address ${minterAddress}`)

		return this.toGetMinterDto(minterInfo)
	}

	@UseGuards(JwtAuthGuard)
	@Get(":type")
	async find(@Param("type") type: string): Promise<GetMinterDto> {
		if (type !== "minter") {
			throw new BadRequestException("Invalid contract type")
		}

		const wallet = await this.walletsService.findRandom(Blockchain.TON, WalletType.Minter)
		if (!wallet) {
			this.logger.log(
				`Available ${WalletType.Collector} wallet in ${Blockchain.TON} not found`,
			)
			throw new NotFoundException(`Available wallet in ${Blockchain.TON} is not found`)
		}

		const tonWallet = this.tonService.createWallet(wallet.secretKey)
		const minterInfo = await this.tonService.getMinterContractData(tonWallet)

		return this.toGetMinterDto(minterInfo)
	}

	private toGetMinterDto(minterInfo: MinterInfo): GetMinterDto {
		return {
			totalSupply: minterInfo.totalSupply,
			minterAddress: minterInfo.minterAddress.toString(true, true, true),
			adminAddress: minterInfo.adminAddress.toString(true, true, true),
			jettonContentUri: minterInfo.jettonContentUri,
			isMutable: minterInfo.isMutable,
		}
	}
}
