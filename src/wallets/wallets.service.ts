import { Injectable } from "@nestjs/common"
import { InjectRepository } from "@nestjs/typeorm"
import { Repository } from "typeorm"
import { CreateWalletDto } from "./dto/create-wallet.dto"
import { Wallet } from "./wallet.entity"

@Injectable()
export class WalletsService {
	constructor(
		@InjectRepository(Wallet)
		private readonly walletsRepository: Repository<Wallet>,
	) {}

	async create(createWalletDto: CreateWalletDto): Promise<Wallet> {
		const wallet = new Wallet()
		wallet.blockchain = createWalletDto.blockchain
		wallet.token = createWalletDto.token
		wallet.address = createWalletDto.address
		wallet.registeredAt = new Date()

		return this.walletsRepository.save(wallet)
	}

	async findOne(id: string): Promise<Wallet> {
		return this.walletsRepository.findOne(id)
	}

	async findAll(): Promise<Wallet[]> {
		return this.walletsRepository.find()
	}
}
