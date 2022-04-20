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
import { Blockchain } from "src/tokens/token.entity"
import { TokensService } from "src/tokens/tokens.service"
import { WalletsService } from "src/wallets/wallets.service"
import { GetTransactionResultDto } from "./dto/get-transaction-result.dto"
import { GetWalletDataDto } from "./dto/get-wallet-data.dto"
import { QueryWalletDataDto } from "./dto/query-wallet-data.dto"
import { TokenData } from "./dto/token-data.dto"
import { TransferTokensDto } from "./dto/transfer-tokens.dto"
import { EthereumBlockchainProvider } from "./ethereum-blockchain.provider"
import { EthereumConractProvider } from "./ethereum-contract.provider"
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
	@Put("wallet/transfer")
	async transferTokens(
		@Body(TransferTokensPipe) transferTokensDto: TransferTokensDto,
	): Promise<GetTransactionResultDto> {
		const token = await this.tokenService.findByBlockchainAndAddress(
			Blockchain.Ethereum,
			transferTokensDto.tokenAddress,
		)
		if (!token) {
			throw new NotFoundException(`${token.symbol} token is not found`)
		}

		const wallet = await this.walletsService.findByAddress(transferTokensDto.sourceAddress)
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
			`${transferTokensDto.amount} ETH transferred from ${transferTokensDto.sourceAddress} ` +
				`to ${transferTokensDto.destinationAddress}`,
		)
		return {
			transactionId,
		}
	}

	@UseGuards(JwtAuthGuard)
	@Get("wallet/data")
	async getWalletData(
		@Query() queryWalletDataDto: QueryWalletDataDto,
	): Promise<GetWalletDataDto> {
		const tokens: TokenData[] = []

		for (const tokenAddress of queryWalletDataDto.tokenAddresses) {
			const token = await this.tokenService.findByBlockchainAndAddress(
				Blockchain.Ethereum,
				tokenAddress,
			)
			if (!token) {
				throw new NotFoundException(`${token.symbol} token is not found`)
			}

			const wallet = await this.walletsService.findByAddress(queryWalletDataDto.walletAddress)
			if (!wallet) {
				throw new NotFoundException("Wallet is not found")
			}

			const tokenContract = this.ethereumContract.createTokenContract(
				token.address,
				wallet.secretKey,
			)
			const balance = await this.ethereumContract.getTokenBalance(
				tokenContract,
				queryWalletDataDto.walletAddress,
				token.decimals,
			)

			tokens.push({
				balance: `${balance.toFixed(token.decimals)} ${token.symbol}`,
				address: token.address,
			})
		}

		return {
			tokens,
		}
	}
}
