import { InjectQueue } from "@nestjs/bull"
import {
	Body,
	Controller,
	Delete,
	Get,
	HttpCode,
	HttpStatus,
	Logger,
	Param,
	ParseUUIDPipe,
	Post,
	Put,
	Query,
	UseGuards,
} from "@nestjs/common"
import BigNumber from "bignumber.js"
import { Queue } from "bull"
import { JwtAuthGuard } from "src/auth/guards/jwt-auth.guard"
import { Blockchain } from "src/common/enums/blockchain.enum"
import {
	ERROR_TOKEN_NOT_FOUND,
	ERROR_WALLET_ALREADY_EXISTS,
	ERROR_WALLET_NOT_FOUND,
} from "src/common/constants"
import { ConflictException } from "src/common/exceptions/conflict.exception"
import { NotFoundException } from "src/common/exceptions/not-found.exception"
import { SecurityService } from "src/common/providers/security.service"
import { EthereumConractService } from "src/ethereum/providers/ethereum-contract.service"
import { GetPublicTokenDto } from "src/tokens/dto/get-token.dto"
import { Token } from "src/tokens/token.entity"
import { TokensRepository } from "src/tokens/providers/tokens.repository"
import { TON_BLOCK_TRACKING_INTERVAL } from "src/ton/constants"
import { TonContractService } from "src/ton/providers/ton-contract.service"
import { DEPLOY_WALLET_ATTEMPTS, TRANSFER_TONCOINS_JOB, WALLETS_QUEUE } from "../constants"
import { AttachWalletDto } from "../dto/attach-wallet.dto"
import { CreateWalletDto } from "../dto/create-wallet.dto"
import { GetWalletDto } from "../dto/get-wallet.dto"
import { TransferToncoinsDto } from "../dto/transfer-toncoins.dto"
import { UpdateWalletDto } from "../dto/update-wallet.dto"
import { WalletType } from "../enums/wallet-type.enum"
import { AttachWalletPipe } from "../pipes/attach-wallet.pipe"
import { WalletsRepository } from "../providers/wallets.repository"
import { Wallet } from "../wallet.entity"

@Controller("wallets")
export class WalletsController {
	private readonly logger = new Logger(WalletsController.name)

	constructor(
		@InjectQueue(WALLETS_QUEUE) private readonly walletsQueue: Queue,
		private readonly tokensRepository: TokensRepository,
		private readonly walletsRepository: WalletsRepository,
		private readonly ethereumContractService: EthereumConractService,
		private readonly tonContractService: TonContractService,
		private readonly securityService: SecurityService,
	) {}

	@UseGuards(JwtAuthGuard)
	@Post("create")
	async createWallet(@Body() createWalletDto: CreateWalletDto): Promise<GetWalletDto> {
		const token = await this.tokensRepository.findById(createWalletDto.tokenId)
		if (!token) {
			throw new NotFoundException(ERROR_TOKEN_NOT_FOUND)
		}

		const wallet = await this.walletsRepository.create(createWalletDto, token)
		this.logger.log(`${wallet.id}: Wallet created`)

		if (token.blockchain === Blockchain.TON) {
			const giverWallet = await this.walletsRepository.findById(createWalletDto.giverWalletId)
			if (!giverWallet) {
				throw new NotFoundException(ERROR_WALLET_NOT_FOUND)
			}

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
	@Post("attach")
	async attachWallet(
		@Body(AttachWalletPipe) attachWalletDto: AttachWalletDto,
	): Promise<GetWalletDto> {
		const token = await this.tokensRepository.findById(attachWalletDto.tokenId)
		if (!token) {
			throw new NotFoundException(ERROR_TOKEN_NOT_FOUND)
		}

		let wallet = await this.walletsRepository.findOne({
			blockchain: token.blockchain,
			address: attachWalletDto.address,
		})
		if (wallet) {
			throw new ConflictException(ERROR_WALLET_ALREADY_EXISTS)
		}

		let balance = new BigNumber(0)
		switch (token.blockchain) {
			case Blockchain.Ethereum: {
				const tokenContract = await this.ethereumContractService.createTokenContract(
					token.address,
					attachWalletDto.secretKey,
				)

				balance = await this.ethereumContractService.getTokenBalance(
					tokenContract,
					attachWalletDto.address,
					token.decimals,
				)
				break
			}
			case Blockchain.TON: {
				if (attachWalletDto.type !== WalletType.Minter) {
					try {
						const conjugatedAddress =
							await this.tonContractService.getJettonWalletAddress(
								token.address,
								attachWalletDto.address,
							)
						attachWalletDto.conjugatedAddress = conjugatedAddress.toString()
					} catch (err: unknown) {
						this.logger.warn(
							`Unable to get conjugated address for wallet ${attachWalletDto.address}`,
						)
					}
				}

				if (attachWalletDto.conjugatedAddress) {
					try {
						const data = await this.tonContractService.getJettonWalletData(
							attachWalletDto.conjugatedAddress,
						)
						balance = data.balance
					} catch (err: unknown) {
						this.logger.warn(
							`Unable to get balance for wallet ${attachWalletDto.address}`,
						)
					}
				}
				break
			}
		}

		wallet = await this.walletsRepository.attach(attachWalletDto, token, balance)
		this.logger.log(`${wallet.id}: Wallet attached`)

		return this.toGetWalletDto(wallet)
	}

	@UseGuards(JwtAuthGuard)
	@Put(":id")
	async updateWallet(
		@Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
		@Body() updateWalletDto: UpdateWalletDto,
	): Promise<GetWalletDto> {
		let wallet = await this.walletsRepository.findById(id)
		if (!wallet) {
			throw new NotFoundException(ERROR_WALLET_NOT_FOUND)
		}

		await this.walletsRepository.update(id, updateWalletDto)
		this.logger.log(`${wallet.id} Wallet updated`)

		wallet = await this.walletsRepository.findById(id)
		return this.toGetWalletDto(wallet)
	}

	@UseGuards(JwtAuthGuard)
	@HttpCode(HttpStatus.NO_CONTENT)
	@Delete(":id")
	async detachWallet(
		@Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
	): Promise<void> {
		const wallet = await this.walletsRepository.findById(id)
		if (!wallet) {
			throw new NotFoundException(ERROR_WALLET_NOT_FOUND)
		}

		await this.walletsRepository.delete(id)
		this.logger.log(`${wallet.id}: Wallet detached`)
	}

	@UseGuards(JwtAuthGuard)
	@Get()
	async getWallets(
		@Query("blockchain") blockchain?: Blockchain,
		@Query("type") type?: WalletType,
		@Query("minBalance") minBalance?: string,
		@Query("inUse") inUse?: boolean,
		@Query("disabled") disabled?: boolean,
	): Promise<GetWalletDto[]> {
		const wallets = await this.walletsRepository.findAll({
			blockchain,
			type,
			minBalance: minBalance && new BigNumber(minBalance),
			inUse,
			disabled,
		})
		const walletDtos = wallets.map((wallet) => this.toGetWalletDto(wallet))
		return Promise.all(walletDtos)
	}

	@UseGuards(JwtAuthGuard)
	@Get(":id")
	async getWallet(
		@Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
	): Promise<GetWalletDto> {
		const wallet = await this.walletsRepository.findById(id)
		if (!wallet) {
			throw new NotFoundException(ERROR_WALLET_NOT_FOUND)
		}

		return this.toGetWalletDto(wallet)
	}

	private async toGetWalletDto(wallet: Wallet): Promise<GetWalletDto> {
		let mnemonic = null
		if (wallet.mnemonic) {
			mnemonic = (await this.securityService.decryptText(wallet.mnemonic)).split(" ")
		}

		return {
			id: wallet.id,
			address: wallet.address,
			mnemonic,
			conjugatedAddress: wallet.conjugatedAddress,
			balance: wallet.balance,
			type: wallet.type,
			token: this.toGetPublicTokenDto(wallet.token),
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
