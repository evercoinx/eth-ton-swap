import {
	BadRequestException,
	Controller,
	Logger,
	NotFoundException,
	Param,
	Post,
} from "@nestjs/common"
import { Blockchain } from "src/tokens/token.entity"
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

	@Post("deploy/:type")
	async deploy(@Param("type") type: string): Promise<GetMinterDto> {
		if (type !== "minter") {
			throw new BadRequestException("Invalid contract type")
		}

		const wallet = await this.walletsService.findRandom(Blockchain.TON, WalletType.Minter)
		if (!wallet) {
			this.logger.log(
				`Available ${WalletType.Collector} wallet in ${Blockchain.TON} not found`,
			)
			throw new NotFoundException(`Available wallet is not found`)
		}

		const tonWallet = this.tonService.createWallet(wallet.secretKey)
		const minterInfo = await this.tonService.deployMinterContract(tonWallet)

		const minterAddress = minterInfo.minterAddress.toString(true, true, true)
		this.logger.log(`Minter deployed in ${Blockchain.TON} at address ${minterAddress}`)

		return {
			totalSupply: minterInfo.totalSupply,
			minterAddress,
			adminAddress: minterInfo.adminAddress.toString(true, true, true),
		}
	}
}
