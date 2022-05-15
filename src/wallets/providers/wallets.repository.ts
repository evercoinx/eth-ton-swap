import { Injectable } from "@nestjs/common"
import { InjectRepository } from "@nestjs/typeorm"
import {
	FindOptionsOrder,
	FindOptionsWhere,
	IsNull,
	MoreThan,
	MoreThanOrEqual,
	Not,
	Repository,
} from "typeorm"
import { QueryDeepPartialEntity } from "typeorm/query-builder/QueryPartialEntity"
import { Blockchain } from "src/common/enums/blockchain.enum"
import { SecurityService } from "src/common/providers/security.service"
import { EthereumBlockchainService } from "src/ethereum/providers/ethereum-blockchain.service"
import { EthereumConractService } from "src/ethereum/providers/ethereum-contract.service"
import { WalletsStats } from "src/stats/interfaces/wallets-stats.interface"
import { TonBlockchainService } from "src/ton/providers/ton-blockchain.service"
import { TonContractService } from "src/ton/providers/ton-contract.service"
import { WalletType } from "../enums/wallet-type.enum"
import { AttachWallet } from "../interfaces/attach-wallet.interface"
import { CountWalletsStats } from "../interfaces/count-wallets-stats.interface"
import { CreateWallet } from "../interfaces/create-wallet.interface"
import { FindAllWallets } from "../interfaces/find-all-wallets.interface"
import { FindBestMatchedWallet } from "../interfaces/find-best-matched-wallet.interface"
import { FindWallet } from "../interfaces/find-wallet.interface"
import { UpdateWallet } from "../interfaces/update-wallet.interface"
import { Wallet } from "../wallet.entity"

@Injectable()
export class WalletsRepository {
	constructor(
		@InjectRepository(Wallet) private readonly repository: Repository<Wallet>,
		private readonly ethereumBlockchainService: EthereumBlockchainService,
		private readonly ethereumContractService: EthereumConractService,
		private readonly tonBlockchainService: TonBlockchainService,
		private readonly tonContractService: TonContractService,
		private readonly securityService: SecurityService,
	) {}

	async create({ type, token }: CreateWallet): Promise<Wallet> {
		const wallet = new Wallet()
		wallet.type = type
		wallet.token = token
		wallet.inUse = false
		wallet.disabled = false

		switch (token.blockchain) {
			case Blockchain.Ethereum: {
				const walletSigner = await this.ethereumContractService.createRandomWalletSigner()

				wallet.address = this.ethereumBlockchainService.normalizeAddress(
					await walletSigner.wallet.getAddress(),
				)
				wallet.secretKey = await this.securityService.encryptText(walletSigner.secretKey)
				wallet.mnemonic = await this.securityService.encryptText(
					walletSigner.mnemonic.join(" "),
				)
				wallet.deployed = true
				break
			}
			case Blockchain.TON: {
				const walletSigner = await this.tonContractService.createRandomWalletSigner()

				wallet.address = this.tonBlockchainService.normalizeAddress(
					await walletSigner.wallet.getAddress(),
				)

				wallet.conjugatedAddress = this.tonBlockchainService.normalizeAddress(
					await this.tonContractService.getJettonWalletAddress(
						token.address,
						wallet.address,
					),
				)

				wallet.secretKey = await this.securityService.encryptText(walletSigner.secretKey)
				wallet.mnemonic = await this.securityService.encryptText(
					walletSigner.mnemonic.join(" "),
				)
				wallet.deployed = false
				break
			}
		}

		return this.repository.save(wallet)
	}

	async attach({
		type,
		secretKey,
		mnemonic,
		address,
		conjugatedAddress,
		token,
		balance,
	}: AttachWallet): Promise<Wallet> {
		const wallet = new Wallet()
		wallet.type = type
		wallet.token = token
		wallet.secretKey = secretKey
		wallet.balance = balance.toString()
		wallet.mnemonic = mnemonic
		wallet.deployed = true
		wallet.inUse = false
		wallet.disabled = false

		switch (token.blockchain) {
			case Blockchain.Ethereum: {
				wallet.address = this.ethereumBlockchainService.normalizeAddress(address)
				break
			}
			case Blockchain.TON: {
				wallet.address = this.tonBlockchainService.normalizeAddress(address)
				wallet.conjugatedAddress =
					this.tonBlockchainService.normalizeAddress(conjugatedAddress)
				break
			}
		}

		return this.repository.save(wallet)
	}

	async update(
		id: string,
		{ mnemonic, conjugatedAddress, balance, type, deployed, inUse, disabled }: UpdateWallet,
	): Promise<void> {
		const partialWallet: QueryDeepPartialEntity<Wallet> = {}
		if (mnemonic !== undefined) {
			partialWallet.mnemonic = await this.securityService.encryptText(mnemonic)
		}
		if (conjugatedAddress !== undefined) {
			partialWallet.conjugatedAddress =
				this.tonBlockchainService.normalizeAddress(conjugatedAddress)
		}
		if (balance !== undefined) {
			partialWallet.balance = balance.toString()
		}
		if (type !== undefined) {
			partialWallet.type = type
		}
		if (deployed !== undefined) {
			partialWallet.deployed = deployed
		}
		if (inUse !== undefined) {
			partialWallet.inUse = inUse
		}
		if (disabled !== undefined) {
			partialWallet.disabled = disabled
		}

		await this.repository.update(id, partialWallet)
	}

	async delete(id: string): Promise<void> {
		await this.repository.delete(id)
	}

	async findAll(
		{
			blockchain,
			type,
			minBalance,
			deployed,
			inUse,
			disabled,
			hasConjugatedAddress,
		}: FindAllWallets,
		order?: FindOptionsOrder<Wallet>,
	): Promise<Wallet[]> {
		const where: FindOptionsWhere<Wallet> = {}
		if (blockchain !== undefined) {
			where.token = { blockchain }
		}
		if (type !== undefined) {
			where.type = type
		}
		if (minBalance !== undefined) {
			where.balance = MoreThanOrEqual(minBalance.toString())
		}
		if (deployed !== undefined) {
			where.deployed = deployed
		}
		if (inUse !== undefined) {
			where.inUse = inUse
		}
		if (disabled !== undefined) {
			where.disabled = disabled
		}
		if (hasConjugatedAddress !== undefined) {
			where.conjugatedAddress = hasConjugatedAddress ? Not(IsNull()) : IsNull()
		}

		return this.repository.find({
			where,
			relations: ["token"],
			order: order ?? {
				token: { name: "asc" },
				type: "asc",
			},
		})
	}

	async findById(id: string): Promise<Wallet | null> {
		return this.repository.findOne({
			where: { id },
			relations: ["token"],
		})
	}

	async findOne({ blockchain, address }: FindWallet): Promise<Wallet | null> {
		return this.repository.findOne({
			where: {
				token: { blockchain },
				address,
			},
			relations: ["token"],
		})
	}

	async findBestMatchedOne({
		blockchain,
		type,
		minBalance,
		inUse,
	}: FindBestMatchedWallet): Promise<Wallet | null> {
		const wallets = await this.findAll(
			{
				blockchain,
				type,
				minBalance,
				inUse,
				disabled: false,
				hasConjugatedAddress: blockchain === Blockchain.TON ? true : undefined,
			},
			{ balance: "asc" },
		)

		return wallets.length ? wallets[0] : null
	}

	async countStats({ tokenAddress }: CountWalletsStats): Promise<WalletsStats> {
		const where = {
			token: { address: tokenAddress },
			type: WalletType.Transferer,
		}
		const total = await this.repository.count({ where })

		const available = await this.repository.count({
			where: {
				...where,
				deployed: true,
				balance: MoreThan("0"),
				inUse: false,
			},
		})

		const inUse = await this.repository.count({
			where: {
				...where,
				inUse: true,
			},
		})

		const disabled = await this.repository.count({
			where: {
				...where,
				disabled: true,
			},
		})

		return {
			total,
			available,
			inUse,
			disabled,
		}
	}
}
