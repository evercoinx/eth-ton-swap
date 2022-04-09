import { Injectable } from "@nestjs/common"
import { InjectRepository } from "@nestjs/typeorm"
import { EthersSigner, getAddress, InjectSignerProvider } from "nestjs-ethers"
import { FindConditions, MoreThanOrEqual, Repository } from "typeorm"
import { QueryDeepPartialEntity } from "typeorm/query-builder/QueryPartialEntity"
import { Blockchain, Token } from "src/tokens/token.entity"
import { TonBlockchainProvider } from "src/ton/ton-blockchain.provider"
import { TonContractProvider } from "src/ton/ton-contract.provider"
import { CreateWalletDto } from "./dto/create-wallet.dto"
import { UpdateWalletDto } from "./dto/update-wallet.dto"
import { Wallet, WalletType } from "./wallet.entity"

@Injectable()
export class WalletsService {
	constructor(
		@InjectRepository(Wallet) private readonly walletsRepository: Repository<Wallet>,
		@InjectSignerProvider() private readonly ethersSigner: EthersSigner,
		private readonly tonBlockchain: TonBlockchainProvider,
		private readonly tonContract: TonContractProvider,
	) {}

	async create(createWalletDto: CreateWalletDto, token: Token): Promise<Wallet> {
		const wallet = new Wallet()
		wallet.type = createWalletDto.type
		wallet.token = token

		if (createWalletDto.secretKey && createWalletDto.address) {
			wallet.secretKey = createWalletDto.secretKey
			wallet.address =
				token.blockchain === Blockchain.Ethereum
					? getAddress(createWalletDto.address).replace(/^0x/, "")
					: this.tonBlockchain.normalizeAddress(createWalletDto.address)
			wallet.deployed = createWalletDto.deployed

			return this.walletsRepository.save(wallet)
		}

		switch (token.blockchain) {
			case Blockchain.Ethereum:
				const ethWallet = this.ethersSigner.createRandomWallet()
				const ethAddress = await ethWallet.getAddress()
				wallet.secretKey = ethWallet.privateKey.replace(/^0x/, "")
				wallet.address = getAddress(ethAddress).replace(/^0x/, "")
				wallet.deployed = true
				break
			case Blockchain.TON:
				const { wallet: tonWallet, secretKey } = this.tonContract.createRandomWalletSigner()
				const tonAddress = await tonWallet.getAddress()
				wallet.secretKey = secretKey
				wallet.address = this.tonBlockchain.normalizeAddress(tonAddress)
				wallet.deployed = false
				break
		}

		return this.walletsRepository.save(wallet)
	}

	async update(updateWalletDto: UpdateWalletDto): Promise<void> {
		const partialWallet: QueryDeepPartialEntity<Wallet> = {}
		if (updateWalletDto.conjugatedAddress !== undefined) {
			partialWallet.conjugatedAddress = this.tonBlockchain.normalizeAddress(
				updateWalletDto.conjugatedAddress,
			)
		}
		if (updateWalletDto.balance !== undefined) {
			partialWallet.balance = updateWalletDto.balance
		}
		if (updateWalletDto.deployed !== undefined) {
			partialWallet.deployed = updateWalletDto.deployed
		}

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

	async findById(id: string): Promise<Wallet | undefined> {
		return await this.walletsRepository.findOne(id, {
			relations: ["token"],
		})
	}

	async findByAddress(address: string): Promise<Wallet | undefined> {
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
