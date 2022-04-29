import { Injectable } from "@nestjs/common"
import { InjectRepository } from "@nestjs/typeorm"
import BigNumber from "bignumber.js"
import { FindOptionsWhere, IsNull, MoreThan, MoreThanOrEqual, Not, Repository } from "typeorm"
import { QueryDeepPartialEntity } from "typeorm/query-builder/QueryPartialEntity"
import { EthereumBlockchainProvider } from "src/ethereum/ethereum-blockchain.provider"
import { EthereumConractProvider } from "src/ethereum/ethereum-contract.provider"
import { WalletsStats } from "src/stats/interfaces/wallets-stats.interface"
import { Blockchain, Token } from "src/tokens/token.entity"
import { TonBlockchainProvider } from "src/ton/ton-blockchain.provider"
import { TonContractProvider } from "src/ton/ton-contract.provider"
import { AttachWalletDto } from "./dto/attach-wallet.dto"
import { CreateWalletDto } from "./dto/create-wallet.dto"
import { UpdateWalletDto } from "./dto/update-wallet.dto"
import { Wallet, WalletType } from "./wallet.entity"

@Injectable()
export class WalletsService {
	constructor(
		@InjectRepository(Wallet) private readonly walletsRepository: Repository<Wallet>,
		private readonly ethereumBlockchain: EthereumBlockchainProvider,
		private readonly ethereumContract: EthereumConractProvider,
		private readonly tonBlockchain: TonBlockchainProvider,
		private readonly tonContract: TonContractProvider,
	) {}

	async create(createWalletDto: CreateWalletDto, token: Token): Promise<Wallet> {
		const wallet = new Wallet()
		wallet.type = createWalletDto.type
		wallet.token = token

		switch (token.blockchain) {
			case Blockchain.Ethereum: {
				const walletSigner = await this.ethereumContract.createRandomWalletSigner()

				wallet.address = this.ethereumBlockchain.normalizeAddress(
					await walletSigner.wallet.getAddress(),
				)
				wallet.secretKey = walletSigner.secretKey
				wallet.mnemonic = walletSigner.mnemonic
				wallet.deployed = true
				break
			}
			case Blockchain.TON: {
				const walletSigner = await this.tonContract.createRandomWalletSigner()

				wallet.address = this.tonBlockchain.normalizeAddress(
					await walletSigner.wallet.getAddress(),
				)

				wallet.conjugatedAddress = this.tonBlockchain.normalizeAddress(
					await this.tonContract.getJettonWalletAddress(token.address, wallet.address),
				)

				wallet.secretKey = walletSigner.secretKey
				wallet.mnemonic = walletSigner.mnemonic
				wallet.deployed = false
				break
			}
		}

		return this.walletsRepository.save(wallet)
	}

	async attach(
		attachWalletDto: AttachWalletDto,
		token: Token,
		balance: BigNumber,
	): Promise<Wallet> {
		const wallet = new Wallet()
		wallet.type = attachWalletDto.type
		wallet.token = token
		wallet.secretKey = attachWalletDto.secretKey
		wallet.balance = balance.toFixed(token.decimals)
		wallet.mnemonic = attachWalletDto.mnemonic?.split(/\s+/)
		wallet.deployed = true

		switch (token.blockchain) {
			case Blockchain.Ethereum: {
				wallet.address = this.ethereumBlockchain.normalizeAddress(attachWalletDto.address)
				break
			}
			case Blockchain.TON: {
				wallet.address = this.tonBlockchain.normalizeAddress(attachWalletDto.address)

				wallet.conjugatedAddress = this.tonBlockchain.normalizeAddress(
					await this.tonContract.getJettonWalletAddress(token.address, wallet.address),
				)
				break
			}
		}

		return this.walletsRepository.save(wallet)
	}

	async update(id: string, updateWalletDto: UpdateWalletDto): Promise<void> {
		const partialWallet: QueryDeepPartialEntity<Wallet> = {}
		if (updateWalletDto.conjugatedAddress !== undefined) {
			partialWallet.conjugatedAddress = this.tonBlockchain.normalizeAddress(
				updateWalletDto.conjugatedAddress,
			)
		}
		if (updateWalletDto.balance !== undefined) {
			partialWallet.balance = updateWalletDto.balance
		}
		if (updateWalletDto.type !== undefined) {
			partialWallet.type = updateWalletDto.type
		}
		if (updateWalletDto.mnemonic !== undefined) {
			partialWallet.mnemonic = updateWalletDto.mnemonic.split(/\s+/)
		}
		if (updateWalletDto.deployed !== undefined) {
			partialWallet.deployed = updateWalletDto.deployed
		}
		if (updateWalletDto.inUse !== undefined) {
			partialWallet.inUse = updateWalletDto.inUse
		}

		await this.walletsRepository.update(id, partialWallet)
	}

	async findAll(
		blockchain?: Blockchain,
		type?: WalletType,
		balance?: string,
		inUse?: boolean,
		hasConjugatedAddress?: boolean,
	): Promise<Wallet[]> {
		const where: FindOptionsWhere<Wallet> = {}
		if (blockchain !== undefined) {
			where.token = { blockchain }
		}
		if (type !== undefined) {
			where.type = type
		}
		if (balance !== undefined) {
			where.balance = MoreThanOrEqual(balance)
		}
		if (inUse !== undefined) {
			where.inUse = inUse
		}
		if (hasConjugatedAddress !== undefined) {
			where.conjugatedAddress = hasConjugatedAddress ? Not(IsNull()) : IsNull()
		}

		return this.walletsRepository.find({
			where,
			relations: ["token"],
			order: {
				token: { name: 1 },
				type: 1,
			},
		})
	}

	async findById(id: string): Promise<Wallet | null> {
		return this.walletsRepository.findOne({
			where: { id },
			relations: ["token"],
		})
	}

	async findOne(blockchain: Blockchain, address: string): Promise<Wallet | null> {
		return this.walletsRepository.findOne({
			where: {
				token: { blockchain },
				address,
			},
			relations: ["token"],
		})
	}

	async findRandomOne(
		blockchain: Blockchain,
		type: WalletType,
		balance?: string,
		inUse?: boolean,
	): Promise<Wallet | null> {
		const wallets = await this.findAll(
			blockchain,
			type,
			balance,
			inUse,
			blockchain === Blockchain.TON,
		)
		if (!wallets.length) {
			return
		}

		const randomIndex = Math.floor(Math.random() * wallets.length)
		return wallets[randomIndex]
	}

	async countStats(tokenAddress: string): Promise<WalletsStats> {
		const total = await this.walletsRepository.count({
			where: {
				token: { address: tokenAddress },
				type: WalletType.Transfer,
			},
		})

		const available = await this.walletsRepository.count({
			where: {
				token: { address: tokenAddress },
				type: WalletType.Transfer,
				deployed: true,
				balance: MoreThan("0"),
				inUse: false,
			},
		})

		const inUse = await this.walletsRepository.count({
			where: {
				token: { address: tokenAddress },
				type: WalletType.Transfer,
				inUse: true,
			},
		})

		return {
			total,
			available,
			inUse,
		}
	}
}
