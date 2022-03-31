import { Injectable } from "@nestjs/common"
import { InjectRepository } from "@nestjs/typeorm"
import { EthersSigner, InjectSignerProvider } from "nestjs-ethers"
import { FindConditions, MoreThanOrEqual, Repository } from "typeorm"
import { QueryDeepPartialEntity } from "typeorm/query-builder/QueryPartialEntity"
import { Blockchain, Token } from "src/tokens/token.entity"
import { TonContractProvider } from "src/ton/ton-contract.provider"
import { Wallet, WalletType } from "./wallet.entity"
import { UpdateWalletDto } from "./dto/update-wallet.dto"

@Injectable()
export class WalletsService {
	constructor(
		@InjectRepository(Wallet) private readonly walletsRepository: Repository<Wallet>,
		@InjectSignerProvider() private readonly ethersSigner: EthersSigner,
		private readonly tonContract: TonContractProvider,
	) {}

	async create(
		token: Token,
		type: WalletType,
		walletSecretKey?: string,
		walletAddress?: string,
	): Promise<Wallet> {
		const wallet = new Wallet()
		wallet.token = token
		wallet.type = type

		if (walletSecretKey && walletAddress) {
			wallet.secretKey = walletSecretKey
			wallet.address = walletAddress
		} else {
			switch (token.blockchain) {
				case Blockchain.Ethereum:
					const ethWallet = this.ethersSigner.createRandomWallet()
					const ethAddress = await ethWallet.getAddress()
					wallet.secretKey = ethWallet.privateKey.slice(2)
					wallet.address = ethAddress.slice(2)
					break
				case Blockchain.TON:
					const { wallet: tonWallet, secretKey } = this.tonContract.createRandomWallet()
					const tonAddress = await tonWallet.getAddress()
					wallet.secretKey = secretKey
					wallet.address = tonAddress.toString(true, true, true)
					break
			}
		}

		return this.walletsRepository.save(wallet)
	}

	async update(updateWalletDto: UpdateWalletDto): Promise<void> {
		const partialWallet: QueryDeepPartialEntity<Wallet> = {}
		partialWallet.balance = updateWalletDto.balance

		await this.walletsRepository.update(updateWalletDto.id, partialWallet)
	}

	async findAll(blockchain?: Blockchain, type?: WalletType, balance?: string): Promise<Wallet[]> {
		const where: FindConditions<Wallet> = {}
		if (blockchain) {
			where.token = { blockchain }
		}
		if (type) {
			where.type = type
		}
		if (balance) {
			where.balance = MoreThanOrEqual(balance)
		}

		return this.walletsRepository.find({
			where,
			relations: ["token"],
			order: {
				token: 1,
				type: 1,
			},
		})
	}

	async findOne(address: string): Promise<Wallet | undefined> {
		return await this.walletsRepository.findOne(
			{ address },
			{
				relations: ["token"],
			},
		)
	}

	async findRandom(
		blockchain: Blockchain,
		type: WalletType,
		balance?: string,
	): Promise<Wallet | undefined> {
		const wallets = await this.findAll(blockchain, type, balance)
		if (!wallets.length) {
			return
		}

		const randomIndex = Math.floor(Math.random() * wallets.length)
		return wallets[randomIndex]
	}
}
