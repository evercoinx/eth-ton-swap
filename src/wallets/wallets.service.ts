import { Injectable } from "@nestjs/common"
import { InjectRepository } from "@nestjs/typeorm"
import { EthersSigner, InjectSignerProvider } from "nestjs-ethers"
import { Repository } from "typeorm"
import { Blockchain, Token } from "src/tokens/token.entity"
import { TonService } from "src/ton/ton.service"
import { Wallet } from "./wallet.entity"

@Injectable()
export class WalletsService {
	constructor(
		@InjectRepository(Wallet)
		private readonly walletsRepository: Repository<Wallet>,
		@InjectSignerProvider()
		private readonly ethersSigner: EthersSigner,
		private readonly tonService: TonService,
	) {}

	async create(token: Token, walletSecretKey?: string, walletAddress?: string): Promise<Wallet> {
		const wallet = new Wallet()
		wallet.token = token

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

	async findAll(): Promise<Wallet[]> {
		return this.walletsRepository.find({
			relations: ["token"],
		})
	}

	async findRandom(blockchain: Blockchain): Promise<Wallet | undefined> {
		const wallets = await this.findAll()
		if (!wallets.length) {
			return
		}

		const filteredWallets = wallets.filter((wallet) => wallet.token.blockchain === blockchain)
		const randomIndex = Math.floor(Math.random() * filteredWallets.length)
		return filteredWallets[randomIndex]
	}
}
