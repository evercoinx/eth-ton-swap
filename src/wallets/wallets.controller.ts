import {
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
import { EthereumConractProvider } from "src/ethereum/ethereum-contract.provider"
import { GetTokenDto } from "src/tokens/dto/get-token.dto"
import { Blockchain, Token } from "src/tokens/token.entity"
import { TokensService } from "src/tokens/tokens.service"
import { CreateWalletDto } from "./dto/create-wallet.dto"
import { GetWalletDto } from "./dto/get-wallet.dto"
import { UpdateWalletDto } from "./dto/update-wallet.dto"
import { CreateWalletPipe } from "./pipes/create-wallet.pipe"
import { Wallet, WalletType } from "./wallet.entity"
import { WalletsService } from "./wallets.service"

@Controller("wallets")
export class WalletsController {
	private readonly logger = new Logger(WalletsController.name)

	constructor(
		private readonly ethereumContract: EthereumConractProvider,
		private readonly tokensSerivce: TokensService,
		private readonly walletsService: WalletsService,
	) {}

	@UseGuards(JwtAuthGuard)
	@Post()
	async createWallet(
		@Body(CreateWalletPipe) createWalletDto: CreateWalletDto,
	): Promise<GetWalletDto> {
		const token = await this.tokensSerivce.findById(createWalletDto.tokenId)
		if (!token) {
			throw new NotFoundException("Token is not found")
		}

		const wallet = await this.walletsService.create(createWalletDto, token)
		this.logger.log(`Wallet ${wallet.address} created in ${token.blockchain}`)

		switch (token.blockchain) {
			case Blockchain.Ethereum:
				wallet.balance = (await this.updateEthWalletBalance(wallet)).toString()
				break
			case Blockchain.TON:
				wallet.balance = (await this.updateTonWalletBalance(wallet)).toString()
				break
		}

		return this.toGetWalletDto(wallet)
	}

	@UseGuards(JwtAuthGuard)
	@Put(":id")
	async updateWallet(
		@Param("id") id: string,
		@Body() updateWalletDto: UpdateWalletDto,
	): Promise<GetWalletDto> {
		const wallet = await this.walletsService.findById(id)
		if (!wallet) {
			throw new NotFoundException("Wallet is not found")
		}

		await this.walletsService.update(id, updateWalletDto)
		this.logger.log(`Wallet ${wallet.address} updated in ${wallet.token.blockchain}`)

		const updatedWallet = await this.walletsService.findById(id)
		return this.toGetWalletDto(updatedWallet)
	}

	@UseGuards(JwtAuthGuard)
	@Get()
	async getWallets(
		@Query("blockchain") blockchain: Blockchain,
		@Query("type") type: WalletType,
	): Promise<GetWalletDto[]> {
		const wallets = await this.walletsService.findAll(blockchain, type)
		return wallets.map((wallet) => this.toGetWalletDto(wallet))
	}

	@UseGuards(JwtAuthGuard)
	@Get(":id")
	async getWallet(@Param("id") id: string): Promise<GetWalletDto> {
		const wallet = await this.walletsService.findById(id)
		if (!wallet) {
			throw new NotFoundException("Wallet is not found")
		}
		return this.toGetWalletDto(wallet)
	}

	private async updateEthWalletBalance(wallet: Wallet): Promise<BigNumber> {
		const tokenContract = this.ethereumContract.createTokenContract(
			wallet.token.address,
			wallet.secretKey,
		)

		const balance = await this.ethereumContract.getTokenBalance(
			tokenContract,
			wallet.address,
			wallet.token.decimals,
		)

		await this.walletsService.update(wallet.id, {
			balance: balance.toFixed(wallet.token.decimals),
		})
		return balance
	}

	private async updateTonWalletBalance(wallet: Wallet): Promise<BigNumber> {
		const balance = new BigNumber(0)
		await this.walletsService.update(wallet.id, { balance: balance.toString() })
		return balance
	}

	private toGetWalletDto(wallet: Wallet): GetWalletDto {
		return {
			id: wallet.id,
			secretKey: wallet.secretKey,
			address: wallet.address,
			conjugatedAddress: wallet.conjugatedAddress,
			balance: wallet.balance,
			type: wallet.type,
			token: this.toGetTokenDto(wallet.token),
			deployed: wallet.deployed,
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
