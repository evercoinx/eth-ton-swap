import { Injectable } from "@nestjs/common"
import { InjectRepository } from "@nestjs/typeorm"
import { EthersSigner, InjectSignerProvider } from "nestjs-ethers"
import { Repository } from "typeorm"
import tonweb from "tonweb"
import nacl from "tweetnacl"
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
					const keyPair = nacl.sign.keyPair()
					const httpProvider = new tonweb.HttpProvider(
						"https://testnet.toncenter.com/api/v2/jsonRPC",
					)
					const tonWallets = new tonweb.Wallets(httpProvider)
					const tonWallet = tonWallets.create({
						publicKey: keyPair.publicKey,
						wc: 0,
					})
					const tonAddress = await tonWallet.getAddress()
					wallet.secretKey = Buffer.from(keyPair.secretKey).toString("hex")
					wallet.address = tonAddress.toString(true, true, false)
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

	async findRandom(): Promise<Wallet | undefined> {
		const wallets = await this.findAll()
		if (!wallets.length) {
			return
		}

		const randomIndex = Math.floor(Math.random() * wallets.length)
		return wallets[randomIndex]
	}
}
