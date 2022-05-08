import {
	ConflictException,
	Body,
	Controller,
	Get,
	Logger,
	NotFoundException,
	Post,
	Put,
	Query,
	UseGuards,
} from "@nestjs/common"
import BigNumber from "bignumber.js"
import { Address } from "tonweb/dist/types/utils/address"
import { JwtAuthGuard } from "src/auth/guards/jwt-auth.guard"
import { Blockchain } from "src/common/enums/blockchain.enum"
import { Token } from "src/tokens/token.entity"
import { DEPLOY_JETTON_MINTER_GAS, JETTON_DECIMALS, TONCOIN_DECIMALS } from "src/ton/constants"
import { TokensService } from "src/tokens/tokens.service"
import { WalletsService } from "src/wallets/wallets.service"
import { BurnJettonsDto } from "./dto/burn-jettons.dto"
import { DeployJettonMinterDto } from "./dto/deploy-jetton-minter.dto"
import { DeployWalletDto } from "./dto/deploy-wallet.dto"
import { GetJettonMinterDataDto } from "./dto/get-jetton-minter-data.dto"
import { GetJettonWalletDataDto } from "./dto/get-jetton-wallet-data.dto"
import { GetTransactionResultDto } from "./dto/get-transaction-result.dto"
import { GetWalletDataDto } from "./dto/get-wallet-data.dto"
import { MintJettonsDto } from "./dto/mint-jettons.dto"
import { QueryContractDataDto } from "./dto/query-contract-data.dto"
import { QueryJettonWalletDataDto } from "./dto/query-jetton-wallet-data.dto"
import { TransferJettonsDto } from "./dto/transfer-jettons.dto"
import { TransferToncoinsDto } from "./dto/transfer-toncoins dto"
import { JettonData } from "./interfaces/jetton-data.interface"
import { DeployJettonMinterPipe } from "./pipes/deploy-jetton-minter.pipe"
import { DeployWalletPipe } from "./pipes/deploy-wallet.pipe"
import { MintJettonsPipe } from "./pipes/mint-jettons.pipe"
import { QueryContractDataPipe } from "./pipes/query-contract-data.pipe"
import { BurnJettonsPipe } from "./pipes/burn-jettons.pipe"
import { TransferJettonsPipe } from "./pipes/transfer-jettons.pipe"
import { TransferToncoinsPipe } from "./pipes/transfer-toncoins.pipe"
import { TonBlockchainService } from "./providers/ton-blockchain.service"
import { TonContractService } from "./providers/ton-contract.service"

@Controller("ton")
export class TonController {
	private readonly logger = new Logger(TonController.name)

	constructor(
		private readonly tonBlockchain: TonBlockchainService,
		private readonly tonContract: TonContractService,
		private readonly tokenService: TokensService,
		private readonly walletsService: WalletsService,
	) {}

	@UseGuards(JwtAuthGuard)
	@Post("wallet")
	async deployWallet(
		@Body(DeployWalletPipe) deployWalletDto: DeployWalletDto,
	): Promise<GetTransactionResultDto> {
		const wallet = await this.walletsService.findOne(Blockchain.TON, deployWalletDto.address)
		if (!wallet) {
			throw new NotFoundException("Wallet is not found")
		}

		const walletSigner = this.tonContract.createWalletSigner(wallet.secretKey)
		const totalFee = await this.tonContract.deployWallet(walletSigner, deployWalletDto.dryRun)

		if (!deployWalletDto.dryRun) {
			await this.walletsService.update(wallet.id, {
				balance: "0",
				deployed: true,
			})
			this.logger.log(`Wallet ${wallet.address} deployed in ${Blockchain.TON}`)
		}

		return { totalFee: totalFee?.toString() }
	}

	@UseGuards(JwtAuthGuard)
	@Post("minter")
	async deployMinter(
		@Body(DeployJettonMinterPipe) deployJettonMinterDto: DeployJettonMinterDto,
	): Promise<GetTransactionResultDto> {
		const adminWallet = await this.walletsService.findOne(
			Blockchain.TON,
			deployJettonMinterDto.adminWalletAddress,
		)
		if (!adminWallet) {
			throw new NotFoundException("Admin wallet is not found")
		}
		if (!adminWallet.deployed) {
			throw new ConflictException("Admin wallet has not been deployed yet")
		}

		const adminWalletSigner = this.tonContract.createWalletSigner(adminWallet.secretKey)
		const totalFee = await this.tonContract.deployJettonMinter(
			adminWalletSigner,
			DEPLOY_JETTON_MINTER_GAS,
			deployJettonMinterDto.dryRun,
		)

		if (!deployJettonMinterDto.dryRun) {
			const jettonMinterData = await this.tonContract.getJettonMinterData(
				adminWalletSigner.wallet.address,
			)

			const jettonMinterAddress = this.tonBlockchain.normalizeAddress(
				jettonMinterData.jettonMinterAddress,
			)
			await this.walletsService.update(adminWallet.id, {
				conjugatedAddress: jettonMinterAddress,
				balance: "0",
				deployed: true,
			})
			this.logger.log(`Jetton minter ${jettonMinterAddress} deployed in ${Blockchain.TON}`)
		}

		return { totalFee: totalFee?.toString() }
	}

	@UseGuards(JwtAuthGuard)
	@Put(`minter/mint`)
	async mintJettons(
		@Body(MintJettonsPipe) mintJettonsDto: MintJettonsDto,
	): Promise<GetTransactionResultDto> {
		const adminWallet = await this.walletsService.findOne(
			Blockchain.TON,
			mintJettonsDto.adminAddress,
		)
		if (!adminWallet) {
			throw new NotFoundException("Admin wallet is not found")
		}

		const destinationWallet = await this.walletsService.findOne(
			Blockchain.TON,
			mintJettonsDto.destinationAddress,
		)
		if (!destinationWallet) {
			throw new NotFoundException("Destination wallet is not found")
		}

		const adminWalletSigner = this.tonContract.createWalletSigner(adminWallet.secretKey)
		const totalFee = await this.tonContract.mintJettons(
			adminWalletSigner,
			mintJettonsDto.destinationAddress,
			new BigNumber(mintJettonsDto.jettonAmount),
			new BigNumber(mintJettonsDto.transferAmount),
			new BigNumber(mintJettonsDto.mintTransferAmount),
			mintJettonsDto.dryRun,
		)

		if (!mintJettonsDto.dryRun) {
			const newBalance = new BigNumber(destinationWallet.balance)
				.plus(mintJettonsDto.jettonAmount)
				.toFixed(JETTON_DECIMALS)

			await this.walletsService.update(destinationWallet.id, { balance: newBalance })

			const data = await this.tonContract.getJettonMinterData(
				adminWalletSigner.wallet.address,
			)
			this.logger.log(
				`Jetton minter at ${this.tonBlockchain.normalizeAddress(
					data.jettonMinterAddress,
				)} minted ${mintJettonsDto.jettonAmount} jettons`,
			)
		}

		return { totalFee: totalFee?.toString() }
	}

	@UseGuards(JwtAuthGuard)
	@Put(`wallet/transfer-toncoins`)
	async transferToncoins(
		@Body(TransferToncoinsPipe) transferToncoinsDto: TransferToncoinsDto,
	): Promise<GetTransactionResultDto> {
		const wallet = await this.walletsService.findOne(
			Blockchain.TON,
			transferToncoinsDto.sourceAddress,
		)
		if (!wallet) {
			throw new NotFoundException("Wallet is not found")
		}

		const walletSigner = this.tonContract.createWalletSigner(wallet.secretKey)
		const amount = new BigNumber(transferToncoinsDto.amount)

		const totalFee = await this.tonContract.transfer(
			walletSigner,
			transferToncoinsDto.destinationAddress,
			amount,
			transferToncoinsDto.bounceable,
			transferToncoinsDto.payload,
			undefined,
			transferToncoinsDto.dryRun,
		)

		if (!transferToncoinsDto.dryRun) {
			this.logger.log(
				`${this.formatToncoins(amount)} transferred from ${
					transferToncoinsDto.sourceAddress
				} ` + `to ${transferToncoinsDto.destinationAddress}`,
			)
		}

		return { totalFee: totalFee?.toString() }
	}

	@UseGuards(JwtAuthGuard)
	@Put(`wallet/transfer-jettons`)
	async transferJettons(
		@Body(TransferJettonsPipe) transferJettonsDto: TransferJettonsDto,
	): Promise<GetTransactionResultDto> {
		const token = await this.tokenService.findOne(
			Blockchain.TON,
			transferJettonsDto.minterAdminWalletAddress,
		)
		if (!token) {
			throw new NotFoundException("Token is not found")
		}

		const sourceWallet = await this.walletsService.findOne(
			Blockchain.TON,
			transferJettonsDto.sourceAddress,
		)
		if (!sourceWallet) {
			throw new NotFoundException("Source wallet is not found")
		}

		const sourceWalletSigner = this.tonContract.createWalletSigner(sourceWallet.secretKey)
		const jettonAmount = new BigNumber(transferJettonsDto.jettonAmount)

		const totalFee = await this.tonContract.transferJettons(
			sourceWalletSigner,
			transferJettonsDto.minterAdminWalletAddress,
			transferJettonsDto.destinationAddress,
			jettonAmount,
			new BigNumber(transferJettonsDto.transferAmount),
			undefined,
			transferJettonsDto.payload,
			transferJettonsDto.dryRun,
		)

		if (!transferJettonsDto.dryRun) {
			this.logger.log(
				`${this.formatJettons(jettonAmount, token)} transferred from ${
					transferJettonsDto.sourceAddress
				} ` + `to ${transferJettonsDto.destinationAddress}`,
			)
		}

		return { totalFee: totalFee?.toString() }
	}

	@UseGuards(JwtAuthGuard)
	@Put(`wallet/burn-jettons`)
	async burnJettons(
		@Body(BurnJettonsPipe) burnJettonsDto: BurnJettonsDto,
	): Promise<GetTransactionResultDto> {
		const token = await this.tokenService.findOne(
			Blockchain.TON,
			burnJettonsDto.minterAdminWalletAddress,
		)
		if (!token) {
			throw new NotFoundException("Token is not found")
		}

		const ownerWallet = await this.walletsService.findOne(
			Blockchain.TON,
			burnJettonsDto.ownerWalletAddress,
		)
		if (!ownerWallet) {
			throw new NotFoundException("Owner wallet is not found")
		}

		const sourceWalletSigner = this.tonContract.createWalletSigner(ownerWallet.secretKey)
		const totalFee = await this.tonContract.burnJettons(
			sourceWalletSigner,
			burnJettonsDto.minterAdminWalletAddress,
			new BigNumber(burnJettonsDto.jettonAmount),
			new BigNumber(burnJettonsDto.transferAmount),
			burnJettonsDto.dryRun,
		)

		if (!burnJettonsDto.dryRun) {
			this.logger.log(
				`${burnJettonsDto.jettonAmount} USDJ burned from ${burnJettonsDto.ownerWalletAddress}`,
			)
		}

		return { totalFee: totalFee?.toString() }
	}

	@UseGuards(JwtAuthGuard)
	@Get(`wallet/data`)
	async getWalletData(
		@Query(QueryContractDataPipe) queryContractDataDto: QueryContractDataDto,
	): Promise<GetWalletDataDto> {
		const data = await this.tonBlockchain.getWalletData(queryContractDataDto.address)

		return {
			isWallet: data.isWallet,
			address: this.tonBlockchain.normalizeAddress(data.address),
			balance: this.formatToncoins(data.balance),
			accountState: data.accountState,
			walletType: data.walletType,
			seqno: data.seqno,
		}
	}

	@UseGuards(JwtAuthGuard)
	@Get(`minter/data`)
	async getMinterData(
		@Query(QueryContractDataPipe) queryContractDataDto: QueryContractDataDto,
	): Promise<GetJettonMinterDataDto> {
		const token = await this.tokenService.findOne(Blockchain.TON, queryContractDataDto.address)
		if (!token) {
			throw new NotFoundException(`Token ${token.symbol} is not found`)
		}

		const data = await this.tonContract.getJettonMinterData(queryContractDataDto.address)

		return {
			totalSupply: this.formatJettons(data.totalSupply, token),
			jettonMinterAddress: this.tonBlockchain.normalizeAddress(data.jettonMinterAddress),
			jettonMinterBalance: this.formatToncoins(data.jettonMinterBalance),
			jettonContentUri: data.jettonContentUri,
			isMutable: data.isMutable,
			adminWalletAddress: this.tonBlockchain.normalizeAddress(data.adminWalletAddress),
			adminWalletBalance: this.formatToncoins(data.adminWalletBalance),
		}
	}

	@UseGuards(JwtAuthGuard)
	@Get(`jetton/data`)
	async getJettonData(
		@Query() queryJettonWalletDataDto: QueryJettonWalletDataDto,
	): Promise<GetJettonWalletDataDto> {
		const jettons: JettonData[] = []

		for (const minterAdminAddress of queryJettonWalletDataDto.minterAdminAddresses) {
			const token = await this.tokenService.findOne(Blockchain.TON, minterAdminAddress)
			if (!token) {
				throw new NotFoundException(`Token ${token.symbol} is not found`)
			}

			let conjugatedAddress: Address
			let balance: BigNumber
			try {
				conjugatedAddress = await this.tonContract.getJettonWalletAddress(
					minterAdminAddress,
					queryJettonWalletDataDto.walletAddress,
				)

				const data = await this.tonContract.getJettonWalletData(conjugatedAddress)
				balance = data.balance
			} catch (err: unknown) {
				balance = new BigNumber(0)
			}

			jettons.push({
				address: this.tonBlockchain.normalizeAddress(
					queryJettonWalletDataDto.walletAddress,
				),
				conjugatedAddress:
					conjugatedAddress && this.tonBlockchain.normalizeAddress(conjugatedAddress),
				balance: this.formatJettons(balance, token),
			})
		}

		return { jettons }
	}

	private formatToncoins(amount: BigNumber): string {
		return `${amount.toFixed(TONCOIN_DECIMALS)} TON`
	}

	private formatJettons(amount: BigNumber, token: Token): string {
		return `${amount.toFixed(token.decimals)} ${token.symbol}`
	}
}
