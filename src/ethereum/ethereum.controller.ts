import {
	Body,
	Controller,
	Get,
	Logger,
	NotFoundException,
	Put,
	Query,
	UseGuards,
} from "@nestjs/common"
import BigNumber from "bignumber.js"
import { JwtAuthGuard } from "src/auth/guards/jwt-auth.guard"
import { Blockchain } from "src/common/enums/blockchain.enum"
import { Token } from "src/tokens/token.entity"
import { TokensService } from "src/tokens/tokens.service"
import { WalletsService } from "src/wallets/wallets.service"
import { GetTransactionResultDto } from "./dto/get-transaction-result.dto"
import { GetTokenWalletDataDto } from "./dto/get-token-wallet-data.dto"
import { QueryTokenWalletDataDto } from "./dto/query-token-wallet-data.dto"
import { TransferEthersDto } from "./dto/transfer-ethers.dto"
import { TransferTokensDto } from "./dto/transfer-tokens.dto"
import { EthereumBlockchainProvider } from "./ethereum-blockchain.provider"
import { EthereumConractProvider } from "./ethereum-contract.provider"
import { TokenData } from "./interfaces/token-data.interface"
import { TransferEthersPipe } from "./pipes/transfer-ethers.pipe"
import { TransferTokensPipe } from "./pipes/transfer-tokens.pipe"

@Controller("eth")
export class EthereumController {
	private readonly logger = new Logger(EthereumController.name)

	constructor(
		private readonly ethereumBlockchain: EthereumBlockchainProvider,
		private readonly ethereumContract: EthereumConractProvider,
		private readonly tokenService: TokensService,
		private readonly walletsService: WalletsService,
	) {}

	@UseGuards(JwtAuthGuard)
	@Put(`wallet/transfer-ethers`)
	async transferEthers(
		@Body(TransferEthersPipe) transferEthersDto: TransferEthersDto,
	): Promise<GetTransactionResultDto> {
		const wallet = await this.walletsService.findOne(
			Blockchain.Ethereum,
			transferEthersDto.sourceAddress,
		)
		if (!wallet) {
			throw new NotFoundException("Wallet is not found")
		}

		const walletSigner = this.ethereumContract.createWalletSigner(wallet.secretKey)
		const transactionId = await this.ethereumContract.transferEthers(
			walletSigner,
			transferEthersDto.destinationAddress,
			new BigNumber(transferEthersDto.amount),
		)

		this.logger.log(
			`${transferEthersDto.amount} ETH transferred from ${transferEthersDto.sourceAddress} ` +
				`to ${transferEthersDto.destinationAddress}`,
		)
		return { transactionId }
	}

	@UseGuards(JwtAuthGuard)
	@Put("wallet/transfer-tokens")
	async transferTokens(
		@Body(TransferTokensPipe) transferTokensDto: TransferTokensDto,
	): Promise<GetTransactionResultDto> {
		const token = await this.tokenService.findOne(
			Blockchain.Ethereum,
			transferTokensDto.tokenAddress,
		)
		if (!token) {
			throw new NotFoundException(`${token.symbol} token is not found`)
		}

		const wallet = await this.walletsService.findOne(
			Blockchain.Ethereum,
			transferTokensDto.sourceAddress,
		)
		if (!wallet) {
			throw new NotFoundException("Wallet is not found")
		}

		const gasPrice = await this.ethereumBlockchain.getGasPrice()

		const tokenContract = this.ethereumContract.createTokenContract(
			token.address,
			wallet.secretKey,
		)
		const transactionId = await this.ethereumContract.transferTokens(
			tokenContract,
			transferTokensDto.destinationAddress,
			new BigNumber(transferTokensDto.amount),
			token.decimals,
			gasPrice,
		)

		this.logger.log(
			`${transferTokensDto.amount} ${token.symbol} transferred from ${transferTokensDto.sourceAddress} ` +
				`to ${transferTokensDto.destinationAddress}`,
		)
		return { transactionId }
	}

	@UseGuards(JwtAuthGuard)
	@Get("wallet/data")
	async getWalletData(
		@Query() queryTokenWalletDataDto: QueryTokenWalletDataDto,
	): Promise<GetTokenWalletDataDto> {
		const tokens: TokenData[] = []

		for (const tokenAddress of queryTokenWalletDataDto.tokenAddresses) {
			const token = await this.tokenService.findOne(Blockchain.Ethereum, tokenAddress)
			if (!token) {
				throw new NotFoundException(`Token ${token.symbol} is not found`)
			}

			const wallet = await this.walletsService.findOne(
				Blockchain.Ethereum,
				queryTokenWalletDataDto.walletAddress,
			)
			if (!wallet) {
				throw new NotFoundException("Wallet is not found")
			}

			const tokenContract = this.ethereumContract.createTokenContract(
				token.address,
				wallet.secretKey,
			)
			const balance = await this.ethereumContract.getTokenBalance(
				tokenContract,
				queryTokenWalletDataDto.walletAddress,
				token.decimals,
			)

			tokens.push({
				address: this.ethereumBlockchain.normalizeAddress(
					queryTokenWalletDataDto.walletAddress,
				),
				balance: this.formatTokens(token, balance),
			})
		}

		return { tokens }
	}

	private formatTokens(token: Token, amount: BigNumber): string {
		return `${amount.toFixed(token.decimals)} ${token.symbol}`
	}
}
