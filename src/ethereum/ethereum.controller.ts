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
import { GetAccountDataDto } from "./dto/get-account-data.dto"
import { GetTransactionResultDto } from "./dto/get-transaction-result.dto"
import { QueryContractDataDto } from "./dto/query-contract-data.dto"
import { TokenData } from "./dto/token-data.dto"
import { TransferDto } from "./dto/transfer.dto"
import { EthereumBlockchainProvider } from "./ethereum-blockchain.provider"
import { EthereumConractProvider } from "./ethereum-contract.provider"

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
	@Put("account/transfer")
	async transferTokens(@Body() transferDto: TransferDto): Promise<GetTransactionResultDto> {
		const token = await this.tokenService.findByBlockchainAndSymbol(Blockchain.Ethereum, "USDC")
		if (!token) {
			throw new NotFoundException("USDC token is not found")
		}

		const wallet = await this.walletsService.findByAddress(transferDto.sourceAddress)
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
			transferDto.destinationAddress,
			new BigNumber(transferDto.amount),
			token.decimals,
			gasPrice,
		)

		this.logger.log(
			`${transferDto.amount} ETH transferred from ${transferDto.sourceAddress} ` +
				`to ${transferDto.destinationAddress}`,
		)
		return {
			transactionId,
		}
	}

	@UseGuards(JwtAuthGuard)
	@Get("account/data")
	async getAccountData(
		@Query() queryContractDataDto: QueryContractDataDto,
	): Promise<GetAccountDataDto> {
		const tokens: TokenData[] = []

		for (const symbol of ["USDC"]) {
			const token = await this.tokenService.findByBlockchainAndSymbol(
				Blockchain.Ethereum,
				symbol,
			)
			if (!token) {
				throw new NotFoundException("USDC token is not found")
			}

			const wallet = await this.walletsService.findByAddress(queryContractDataDto.address)
			if (!wallet) {
				throw new NotFoundException("Wallet is not found")
			}

			const tokenContract = this.ethereumContract.createTokenContract(
				token.address,
				wallet.secretKey,
			)
			const balance = await this.ethereumContract.getTokenBalance(
				tokenContract,
				queryContractDataDto.address,
				token.decimals,
			)

			tokens.push({
				balance: `${balance.toFixed(token.decimals)} ${symbol}`,
				address: token.address,
			})
		}
		return {
			tokens,
		}
	}
}
