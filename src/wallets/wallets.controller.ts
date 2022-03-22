import {
	Body,
	Controller,
	Get,
	Logger,
	NotFoundException,
	Post,
	Query,
	UseGuards,
} from "@nestjs/common"
import {
	BigNumber,
	EthersContract,
	EthersSigner,
	formatUnits,
	InjectContractProvider,
	InjectSignerProvider,
} from "nestjs-ethers"
import { JwtAuthGuard } from "src/auth/guards/jwt-auth.guard"
import { ERC20_TOKEN_CONTRACT_ABI } from "src/common/constants"
import { GetTokenDto } from "src/tokens/dto/get-token.dto"
import { Blockchain, Token } from "src/tokens/token.entity"
import { TokensService } from "src/tokens/tokens.service"
import { CreateWalletDto } from "./dto/create-wallet.dto"
import { GetWalletDto } from "./dto/get-wallet.dto"
import { Wallet, WalletType } from "./wallet.entity"
import { WalletsService } from "./wallets.service"

@Controller("wallets")
export class WalletsController {
	private readonly logger = new Logger(WalletsController.name)

	constructor(
		@InjectSignerProvider() private readonly signer: EthersSigner,
		@InjectContractProvider() private readonly contract: EthersContract,
		private readonly tokensSerivce: TokensService,
		private readonly walletsService: WalletsService,
	) {}

	@UseGuards(JwtAuthGuard)
	@Post()
	async create(@Body() createWalletDto: CreateWalletDto): Promise<GetWalletDto> {
		const token = await this.tokensSerivce.findById(createWalletDto.tokenId)
		if (!token) {
			throw new NotFoundException("Token is not found")
		}

		const wallet = await this.walletsService.create(
			token,
			createWalletDto.type,
			createWalletDto.secretKey,
			createWalletDto.address,
		)
		this.logger.log(`Wallet ${wallet.address} created successfully`)

		if (wallet.type === WalletType.Transfer) {
			const walletSigner = this.signer.createWallet(`0x${wallet.secretKey}`)
			const contract = this.contract.create(
				`0x${wallet.token.address}`,
				ERC20_TOKEN_CONTRACT_ABI,
				walletSigner,
			)

			const balance: BigNumber = await contract.balanceOf(wallet.address)
			await this.walletsService.update({
				id: wallet.id,
				balance: formatUnits(balance, wallet.token.decimals),
			})
		}
		return this.toGetWalletDto(wallet)
	}

	@UseGuards(JwtAuthGuard)
	@Get()
	async findAll(
		@Query("blockchain") blockchain: Blockchain,
		@Query("type") type: WalletType,
	): Promise<GetWalletDto[]> {
		const wallets = await this.walletsService.findAll(blockchain, type)
		return wallets.map((wallet) => this.toGetWalletDto(wallet))
	}

	private toGetWalletDto(wallet: Wallet): GetWalletDto {
		return {
			id: wallet.id,
			secretKey: wallet.secretKey,
			address: wallet.address,
			balance: wallet.balance,
			type: wallet.type,
			token: this.toGetTokenDto(wallet.token),
			createdAt: wallet.createdAt.getTime(),
		}
	}

	private toGetTokenDto(token: Token): GetTokenDto {
		return {
			id: token.id,
			blockchain: token.blockchain,
			name: token.name,
			symbol: token.symbol,
			decimals: token.decimals,
			address: token.address,
		}
	}
}
