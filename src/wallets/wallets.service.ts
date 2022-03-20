import { Injectable } from "@nestjs/common"
import { InjectRepository } from "@nestjs/typeorm"
import { EthersSigner, InjectSignerProvider } from "nestjs-ethers"
import { FindConditions, Repository } from "typeorm"
import { Blockchain, Token } from "src/tokens/token.entity"
import { TonService } from "src/ton/ton.service"
import { Wallet, WalletType } from "./wallet.entity"

@Injectable()
export class WalletsService {
	constructor(
		@InjectRepository(Wallet) private readonly walletsRepository: Repository<Wallet>,
		@InjectSignerProvider() private readonly ethersSigner: EthersSigner,
		private readonly tonService: TonService,
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
					const { wallet: tonWallet, secretKey } = this.tonService.createRandomWallet()
					const tonAddress = await tonWallet.getAddress()
					wallet.secretKey = secretKey
					wallet.address = tonAddress.toString(true, true, true)
					break
			}
		}

		return this.walletsRepository.save(wallet)
	}

	async findAll(blockchain?: Blockchain, type?: WalletType): Promise<Wallet[]> {
		const where: FindConditions<Wallet> = {}
		if (blockchain) {
			where.token = { blockchain }
		}
		if (type) {
			where.type = type
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

	async findRandom(blockchain: Blockchain, type: WalletType): Promise<Wallet | undefined> {
		const wallets = await this.findAll(blockchain, type)
		if (!wallets.length) {
			return
		}

		const randomIndex = Math.floor(Math.random() * wallets.length)
		return wallets[randomIndex]
	}
}
