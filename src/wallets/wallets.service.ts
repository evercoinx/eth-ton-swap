import { Injectable } from "@nestjs/common"
import { InjectRepository } from "@nestjs/typeorm"
import { EthersSigner, InjectSignerProvider } from "nestjs-ethers"
import { Repository } from "typeorm"
import { Blockchain, Token } from "src/tokens/token.entity"
import { Wallet } from "./wallet.entity"

@Injectable()
export class WalletsService {
	constructor(
		@InjectRepository(Wallet)
		private readonly walletsRepository: Repository<Wallet>,
		@InjectSignerProvider()
		private readonly ethersSigner: EthersSigner,
	) {}

	async create(token: Token): Promise<Wallet> {
		const wallet = new Wallet()
		wallet.token = token

		switch (token.blockchain) {
			case Blockchain.Ethereum:
				const ethWallet = this.ethersSigner.createRandomWallet()
				wallet.secretKey = ethWallet.privateKey
				wallet.address = await ethWallet.getAddress()
				break
			case Blockchain.TON:
				wallet.secretKey = ""
				wallet.address = ""
				break
		}

		return this.walletsRepository.save(wallet)
	}

	async findAll(): Promise<Wallet[]> {
		return this.walletsRepository.find({
			relations: ["token"],
		})
	}

	async findRandom(): Promise<Wallet | undefined> {
		const wallets = await this.findAll()
		if (!wallets.length) {
			return
		}

		const randomIndex = Math.floor(Math.random() * wallets.length)
		return wallets[randomIndex]
	}
}
