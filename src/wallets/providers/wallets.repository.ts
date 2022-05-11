import { Injectable } from "@nestjs/common"
import { InjectRepository } from "@nestjs/typeorm"
import BigNumber from "bignumber.js"
import { FindOptionsWhere, IsNull, MoreThan, MoreThanOrEqual, Not, Repository } from "typeorm"
import { QueryDeepPartialEntity } from "typeorm/query-builder/QueryPartialEntity"
import { Blockchain } from "src/common/enums/blockchain.enum"
import { SecurityService } from "src/common/providers/security.service"
import { EthereumBlockchainService } from "src/ethereum/providers/ethereum-blockchain.service"
import { EthereumConractService } from "src/ethereum/providers/ethereum-contract.service"
import { WalletsStats } from "src/stats/interfaces/wallets-stats.interface"
import { Token } from "src/tokens/token.entity"
import { TonBlockchainService } from "src/ton/providers/ton-blockchain.service"
import { TonContractService } from "src/ton/providers/ton-contract.service"
import { AttachWalletDto } from "../dto/attach-wallet.dto"
import { CreateWalletDto } from "../dto/create-wallet.dto"
import { UpdateWalletDto } from "../dto/update-wallet.dto"
import { WalletType } from "../enums/wallet-type.enum"
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

	async create(createWalletDto: CreateWalletDto, token: Token): Promise<Wallet> {
		const wallet = new Wallet()
		wallet.type = createWalletDto.type
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

	async attach(
		attachWalletDto: AttachWalletDto,
		token: Token,
		balance: BigNumber,
	): Promise<Wallet> {
		const wallet = new Wallet()
		wallet.type = attachWalletDto.type
		wallet.token = token
		wallet.secretKey = attachWalletDto.secretKey
		wallet.balance = balance.toFixed(token.decimals)
		wallet.mnemonic = attachWalletDto.mnemonic
		wallet.deployed = true
		wallet.inUse = false
		wallet.disabled = false

		switch (token.blockchain) {
			case Blockchain.Ethereum: {
				wallet.address = this.ethereumBlockchainService.normalizeAddress(
					attachWalletDto.address,
				)
				break
			}
			case Blockchain.TON: {
				wallet.address = this.tonBlockchainService.normalizeAddress(attachWalletDto.address)
				wallet.conjugatedAddress = this.tonBlockchainService.normalizeAddress(
					attachWalletDto.conjugatedAddress,
				)
				break
			}
		}

		return this.repository.save(wallet)
	}

	async update(id: string, updateWalletDto: UpdateWalletDto): Promise<void> {
		const partialWallet: QueryDeepPartialEntity<Wallet> = {}
		if (updateWalletDto.mnemonic !== undefined) {
			partialWallet.mnemonic = await this.securityService.encryptText(
				updateWalletDto.mnemonic,
			)
		}
		if (updateWalletDto.conjugatedAddress !== undefined) {
			partialWallet.conjugatedAddress = this.tonBlockchainService.normalizeAddress(
				updateWalletDto.conjugatedAddress,
			)
		}
		if (updateWalletDto.balance !== undefined) {
			partialWallet.balance = updateWalletDto.balance
		}
		if (updateWalletDto.type !== undefined) {
			partialWallet.type = updateWalletDto.type
		}
		if (updateWalletDto.deployed !== undefined) {
			partialWallet.deployed = updateWalletDto.deployed
		}
		if (updateWalletDto.inUse !== undefined) {
			partialWallet.inUse = updateWalletDto.inUse
		}
		if (updateWalletDto.disabled !== undefined) {
			partialWallet.disabled = updateWalletDto.disabled
		}

		await this.repository.update(id, partialWallet)
	}

	async delete(id: string): Promise<void> {
		await this.repository.delete(id)
	}

	async findAll(
		blockchain?: Blockchain,
		type?: WalletType,
		balance?: BigNumber,
		inUse?: boolean,
		disabled?: boolean,
		hasConjugatedAddress?: boolean,
	): Promise<Wallet[]> {
		const where: FindOptionsWhere<Wallet> = {}
		if (blockchain !== undefined) {
			where.token = { blockchain }
		}
		if (type !== undefined) {
			where.type = type
		}
		if (balance !== undefined) {
			where.balance = MoreThanOrEqual(balance.toString())
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
			order: {
				token: { name: 1 },
				type: 1,
			},
		})
	}

	async findById(id: string): Promise<Wallet | null> {
		return this.repository.findOne({
			where: { id },
			relations: ["token"],
		})
	}

	async findOne(blockchain: Blockchain, address: string): Promise<Wallet | null> {
		return this.repository.findOne({
			where: {
				token: { blockchain },
				address,
			},
			relations: ["token"],
		})
	}

	async findRandomOne(
		blockchain: Blockchain,
		type: WalletType,
		balance?: BigNumber,
		inUse?: boolean,
	): Promise<Wallet | null> {
		const wallets = await this.findAll(
			blockchain,
			type,
			balance,
			inUse,
			false,
			blockchain === Blockchain.TON,
		)
		if (!wallets.length) {
			return
		}

		const randomIndex = Math.floor(Math.random() * wallets.length)
		return wallets[randomIndex]
	}

	async countStats(tokenAddress: string): Promise<WalletsStats> {
		const where = {
			token: { address: tokenAddress },
			type: WalletType.Transfer,
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
