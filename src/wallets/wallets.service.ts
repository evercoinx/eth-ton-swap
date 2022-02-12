import { Injectable } from "@nestjs/common"
import { InjectRepository } from "@nestjs/typeorm"
import { Repository } from "typeorm"
import { EthersSigner, InjectSignerProvider } from "nestjs-ethers"
import { Wallet } from "./wallet.entity"
import { Blockchain, Token } from "../tokens/token.entity"

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

		wallet.token = token
		wallet.createdAt = new Date()

		return this.walletsRepository.save(wallet)
	}

	async findAll(): Promise<Wallet[]> {
		return this.walletsRepository.find()
	}
}
