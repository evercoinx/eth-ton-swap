import { InjectQueue } from "@nestjs/bull"
import {
	BadRequestException,
	Body,
	Controller,
	Delete,
	Get,
	HttpCode,
	HttpStatus,
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
import { Blockchain, getAllBlockchains } from "src/common/enums/blockchain.enum"
import { capitalize } from "src/common/utils"
import { EthereumConractService } from "src/ethereum/providers/ethereum-contract.service"
import { GetPublicTokenDto } from "src/tokens/dto/get-token.dto"
import { Token } from "src/tokens/token.entity"
import { TokensRepository } from "src/tokens/providers/tokens.repository"
import { TON_BLOCK_TRACKING_INTERVAL } from "src/ton/constants"
import { TonContractService } from "src/ton/providers/ton-contract.service"
import { DEPLOY_WALLET_ATTEMPTS, TRANSFER_TONCOINS_JOB, WALLETS_QUEUE } from "./constants"
import { AttachWalletDto } from "./dto/attach-wallet.dto"
import { CreateWalletDto } from "./dto/create-wallet.dto"
import { DepositWalletsBalanceDto } from "./dto/deposit-wallets-balance.dto"
import { GetWalletDto } from "./dto/get-wallet.dto"
import { SyncWalletsTokenBalanceDto } from "./dto/sync-wallets-token-balance.dto"
import { TransferToncoinsDto } from "./dto/transfer-toncoins.dto"
import { UpdateWalletDto } from "./dto/update-wallet.dto"
import { WalletType } from "./enums/wallet-type.enum"
import { AttachWalletPipe } from "./pipes/attach-wallet.pipe"
import { WalletsRepository } from "./providers/wallets.repository"
import { DepositWalletsBalanceTask } from "./tasks/deposit-wallets-balance.task"
import { SyncWalletsTokenBalanceTask } from "./tasks/sync-wallets-token-balance.task"
import { Wallet } from "./wallet.entity"

@Controller("wallets")
export class WalletsController {
	private readonly logger = new Logger(WalletsController.name)

	constructor(
		@InjectQueue(WALLETS_QUEUE) private readonly walletsQueue: Queue,
		private readonly ethereumContract: EthereumConractService,
		private readonly tonContract: TonContractService,
		private readonly tokensRepository: TokensRepository,
		private readonly walletsRepository: WalletsRepository,
		private readonly depositWalletsBalanceTask: DepositWalletsBalanceTask,
		private readonly syncWalletsTokenBalanceTask: SyncWalletsTokenBalanceTask,
	) {}

	@UseGuards(JwtAuthGuard)
	@Post("/create")
	async createWallet(@Body() createWalletDto: CreateWalletDto): Promise<GetWalletDto> {
		const token = await this.tokensRepository.findById(createWalletDto.tokenId)
		if (!token) {
			throw new NotFoundException("Token is not found")
		}

		const giverWallet = await this.walletsRepository.findById(createWalletDto.giverWalletId)
		if (!giverWallet) {
			throw new NotFoundException("Giver wallet is not found")
		}

		const wallet = await this.walletsRepository.create(createWalletDto, token)
		this.logger.log(
			`${capitalize(createWalletDto.type)} wallet at ${wallet.address} created in ${
				token.blockchain
			}`,
		)

		if (token.blockchain === Blockchain.TON) {
			await this.walletsQueue.add(
				TRANSFER_TONCOINS_JOB,
				{
					walletId: wallet.id,
					giverWalletId: giverWallet.id,
				} as TransferToncoinsDto,
				{
					attempts: DEPLOY_WALLET_ATTEMPTS,
					backoff: {
						type: "fixed",
						delay: TON_BLOCK_TRACKING_INTERVAL,
					},
				},
			)
		}

		return this.toGetWalletDto(wallet)
	}

	@UseGuards(JwtAuthGuard)
	@Post("/attach")
	async attachWallet(
		@Body(AttachWalletPipe) attachWalletDto: AttachWalletDto,
	): Promise<GetWalletDto> {
		const token = await this.tokensRepository.findById(attachWalletDto.tokenId)
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

		const wallet = await this.walletsRepository.attach(attachWalletDto, token, balance)
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
		const wallet = await this.walletsRepository.findById(id)
		if (!wallet) {
			throw new NotFoundException("Wallet is not found")
		}

		await this.walletsRepository.update(id, updateWalletDto)
		this.logger.log(`Wallet ${wallet.address} updated in ${wallet.token.blockchain}`)

		const updatedWallet = await this.walletsRepository.findById(id)
		return this.toGetWalletDto(updatedWallet)
	}

	@UseGuards(JwtAuthGuard)
	@HttpCode(HttpStatus.NO_CONTENT)
	@Post("deposit-balance")
	async depositWalletsBalance(
		@Body() depositWalletsBalanceDto: DepositWalletsBalanceDto,
	): Promise<void> {
		if (depositWalletsBalanceDto.blockchains.includes(Blockchain.Ethereum)) {
			this.depositWalletsBalanceTask.runEthereum()
		}
		if (depositWalletsBalanceDto.blockchains.includes(Blockchain.TON)) {
			this.depositWalletsBalanceTask.runTon()
		}
	}

	@UseGuards(JwtAuthGuard)
	@HttpCode(HttpStatus.NO_CONTENT)
	@Post("sync-token-balance")
	async syncWalletsTokenBalance(
		@Body() syncWalletsTokenBalanceDto: SyncWalletsTokenBalanceDto,
	): Promise<void> {
		if (syncWalletsTokenBalanceDto.blockchains.includes(Blockchain.Ethereum)) {
			this.syncWalletsTokenBalanceTask.runEthereum()
		}
		if (syncWalletsTokenBalanceDto.blockchains.includes(Blockchain.TON)) {
			this.syncWalletsTokenBalanceTask.runTon()
		}
	}

	@UseGuards(JwtAuthGuard)
	@HttpCode(HttpStatus.NO_CONTENT)
	@Delete(":id")
	async deleteWallet(@Param("id") id: string): Promise<void> {
		const wallet = await this.walletsRepository.findById(id)
		if (!wallet) {
			throw new NotFoundException("Wallet is not found")
		}

		await this.walletsRepository.delete(id)
		this.logger.log(`Wallet ${wallet.address} deleted in ${wallet.token.blockchain}`)
	}

	@UseGuards(JwtAuthGuard)
	@Get()
	async getWallets(
		@Query("blockchain") blockchain: Blockchain,
		@Query("type") type: WalletType,
	): Promise<GetWalletDto[]> {
		if (!getAllBlockchains().includes(blockchain)) {
			throw new BadRequestException("Invalid blockchain is specified")
		}

		const wallets = await this.walletsRepository.findAll(blockchain, type)
		return wallets.map((wallet) => this.toGetWalletDto(wallet))
	}

	@UseGuards(JwtAuthGuard)
	@Get(":id")
	async getWallet(@Param("id") id: string): Promise<GetWalletDto> {
		const wallet = await this.walletsRepository.findById(id)
		if (!wallet) {
			throw new NotFoundException("Wallet is not found")
		}

		return this.toGetWalletDto(wallet)
	}

	private toGetWalletDto(wallet: Wallet): GetWalletDto {
		return {
			id: wallet.id,
			secretKey: wallet.secretKey,
			address: wallet.address,
			conjugatedAddress: wallet.conjugatedAddress,
			balance: wallet.balance,
			type: wallet.type,
			token: this.toGetPublicTokenDto(wallet.token),
			mnemonic: wallet.mnemonic,
			deployed: wallet.deployed,
			isUse: wallet.inUse,
			disabled: wallet.disabled,
			createdAt: wallet.createdAt.getTime(),
			updatedAt: wallet.updatedAt.getTime(),
		}
	}

	private toGetPublicTokenDto(token: Token): GetPublicTokenDto {
		return {
			id: token.id,
			blockchain: token.blockchain,
			name: token.name,
			symbol: token.symbol,
			decimals: token.decimals,
			address: token.address,
			conjugatedAddress: token.conjugatedAddress,
		}
	}
}
