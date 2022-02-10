import { Injectable } from "@nestjs/common"
import { InjectRepository } from "@nestjs/typeorm"
import { Repository } from "typeorm"
import { EthersSigner, InjectSignerProvider } from "nestjs-ethers"
import { CreateWalletDto } from "./dto/create-wallet.dto"
import { ListWalletsDto } from "./dto/list-wallets.dto"
import { Wallet } from "./wallet.entity"

@Injectable()
export class WalletsService {
	constructor(
		@InjectRepository(Wallet)
		private readonly walletsRepository: Repository<Wallet>,
		@InjectSignerProvider()
		private readonly ethersSigner: EthersSigner,
	) {}

	async create(createWalletDto: CreateWalletDto): Promise<Wallet> {
		const wallet = new Wallet()
		wallet.blockchain = createWalletDto.blockchain
		wallet.token = createWalletDto.token
		wallet.address = createWalletDto.address
		wallet.createdAt = new Date()

		return this.walletsRepository.save(wallet)
	}

	async findAll(listWalletsDto: ListWalletsDto): Promise<Wallet[]> {
		return this.walletsRepository.find(listWalletsDto)
	}
}
