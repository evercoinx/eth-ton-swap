import { InjectQueue } from "@nestjs/bull"
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
import { Queue } from "bull"
import { JwtAuthGuard } from "src/auth/guards/jwt-auth.guard"
import { capitalize } from "src/common/utils"
import { EthereumConractProvider } from "src/ethereum/ethereum-contract.provider"
import { GetTokenDto } from "src/tokens/dto/get-token.dto"
import { Blockchain, Token } from "src/tokens/token.entity"
import { TokensService } from "src/tokens/tokens.service"
import { TonBlockchainProvider } from "src/ton/ton-blockchain.provider"
import { TonContractProvider } from "src/ton/ton-contract.provider"
import { WALLETS_QUEUE } from "./constants"
import { AttachWalletDto } from "./dto/attach-wallet.dto"
import { CreateWalletDto } from "./dto/create-wallet.dto"
import { GetWalletDto } from "./dto/get-wallet.dto"
import { UpdateWalletDto } from "./dto/update-wallet.dto"
import { AttachWalletPipe } from "./pipes/attach-wallet.pipe"
import { Wallet, WalletType } from "./wallet.entity"
import { WalletsService } from "./wallets.service"

@Controller("wallets")
export class WalletsController {
	private readonly logger = new Logger(WalletsController.name)

	constructor(
		@InjectQueue(WALLETS_QUEUE) private readonly walletsQueue: Queue,
		private readonly ethereumContract: EthereumConractProvider,
		private readonly tonBlockchain: TonBlockchainProvider,
		private readonly tonContract: TonContractProvider,
		private readonly tokensSerivce: TokensService,
		private readonly walletsService: WalletsService,
	) {}

	@UseGuards(JwtAuthGuard)
	@Post("/create")
	async createWallet(@Body() createWalletDto: CreateWalletDto): Promise<GetWalletDto> {
		const token = await this.tokensSerivce.findById(createWalletDto.tokenId)
		if (!token) {
			throw new NotFoundException("Token is not found")
		}

		const wallet = await this.walletsService.create(createWalletDto, token)
		this.logger.log(
			`${capitalize(createWalletDto.type)} wallet at ${wallet.address} created in ${
				token.blockchain
			}`,
		)

		return this.toGetWalletDto(wallet)
	}

	@UseGuards(JwtAuthGuard)
	@Post("/attach")
	async attachWallet(
		@Body(AttachWalletPipe) attachWalletDto: AttachWalletDto,
	): Promise<GetWalletDto> {
		const token = await this.tokensSerivce.findById(attachWalletDto.tokenId)
		if (!token) {
			throw new NotFoundException("Token is not found")
		}

		let balance = new BigNumber(0)
		switch (token.blockchain) {
			case Blockchain.Ethereum: {
				const tokenContract = this.ethereumContract.createTokenContract(
					token.address,
					attachWalletDto.secretKey,
				)
				balance = await this.ethereumContract.getTokenBalance(
					tokenContract,
					attachWalletDto.address,
					token.decimals,
				)
				break
			}
			case Blockchain.TON: {
				if (attachWalletDto.conjugatedAddress) {
					try {
						const data = await this.tonContract.getJettonWalletData(
							attachWalletDto.conjugatedAddress,
						)
						balance = data.balance
					} catch (err: unknown) {}
				}
				break
			}
		}

		const wallet = await this.walletsService.attach(attachWalletDto, token, balance)
		this.logger.log(
			`${capitalize(attachWalletDto.type)} wallet at ${wallet.address} attached in ${
				token.blockchain
			}`,
		)

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

	private async updateEthereumBalance(wallet: Wallet): Promise<BigNumber> {
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

	private async updateTonBalance(wallet: Wallet): Promise<BigNumber> {
		let balance = new BigNumber(0)
		if (wallet.conjugatedAddress) {
			try {
				const data = await this.tonContract.getJettonWalletData(wallet.conjugatedAddress)
				balance = data.balance
			} catch (err: unknown) {}
		}

		await this.walletsService.update(wallet.id, {
			balance: balance.toFixed(wallet.token.decimals),
		})
		return balance
	}

	private async updateTonConjugatedAddress(wallet: Wallet): Promise<string> {
		const conjugatedAddress = await this.tonContract.getJettonWalletAddress(
			wallet.token.address,
			wallet.address,
		)

		const normalizedConjugatedAddress = this.tonBlockchain.normalizeAddress(conjugatedAddress)
		await this.walletsService.update(wallet.id, {
			conjugatedAddress: normalizedConjugatedAddress,
		})
		return normalizedConjugatedAddress
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
			mnemonic: wallet.mnemonic,
			deployed: wallet.deployed,
			isUse: wallet.inUse,
			createdAt: wallet.createdAt.getTime(),
			updatedAt: wallet.updatedAt.getTime(),
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
