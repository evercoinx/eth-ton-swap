import { Body, Controller, Get, Logger, Put, Query, UseGuards } from "@nestjs/common"
import BigNumber from "bignumber.js"
import { JwtAuthGuard } from "src/auth/guards/jwt-auth.guard"
import { ERROR_TOKEN_NOT_FOUND, ERROR_WALLET_NOT_FOUND } from "src/common/constants"
import { Blockchain } from "src/common/enums/blockchain.enum"
import { NotFoundException } from "src/common/exceptions/not-found.exception"
import { Token } from "src/tokens/token.entity"
import { TokensRepository } from "src/tokens/providers/tokens.repository"
import { WalletsRepository } from "src/wallets/providers/wallets.repository"
import { GetTokenDataDto } from "../dto/get-token-data.dto"
import { GetTransactionResultDto } from "../dto/get-transaction-result.dto"
import { QueryTokenDataDto } from "../dto/query-token-data.dto"
import { TransferEthersDto } from "../dto/transfer-ethers.dto"
import { TransferTokensDto } from "../dto/transfer-tokens.dto"
import { TokenData } from "../interfaces/token-data.interface"
import { QueryTokenDataPipe } from "../pipes/query-token-data.pipe"
import { TransferEthersPipe } from "../pipes/transfer-ethers.pipe"
import { TransferTokensPipe } from "../pipes/transfer-tokens.pipe"
import { EthereumBlockchainService } from "../providers/ethereum-blockchain.service"
import { EthereumConractService } from "../providers/ethereum-contract.service"

@Controller("ethereum")
export class EthereumController {
	private readonly logger = new Logger(EthereumController.name)

	constructor(
		private readonly tokensRepository: TokensRepository,
		private readonly walletsRepository: WalletsRepository,
		private readonly ethereumBlockchainService: EthereumBlockchainService,
		private readonly ethereumContractService: EthereumConractService,
	) {}

	@UseGuards(JwtAuthGuard)
	@Put(`wallet/transfer-ethers`)
	async transferEthers(
		@Body(TransferEthersPipe) transferEthersDto: TransferEthersDto,
	): Promise<GetTransactionResultDto> {
		const wallet = await this.walletsRepository.findOne({
			blockchain: Blockchain.Ethereum,
			address: transferEthersDto.sourceAddress,
		})
		if (!wallet) {
			throw new NotFoundException(ERROR_WALLET_NOT_FOUND)
		}

		const walletSigner = await this.ethereumContractService.createWalletSigner(wallet.secretKey)

		const transactionId = await this.ethereumContractService.transferEthers(
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
		const token = await this.tokensRepository.findOne(
			Blockchain.Ethereum,
			transferTokensDto.tokenAddress,
		)
		if (!token) {
			throw new NotFoundException(ERROR_TOKEN_NOT_FOUND)
		}

		const wallet = await this.walletsRepository.findOne({
			blockchain: Blockchain.Ethereum,
			address: transferTokensDto.sourceAddress,
		})
		if (!wallet) {
			throw new NotFoundException(ERROR_WALLET_NOT_FOUND)
		}

		const gasPrice = await this.ethereumBlockchainService.getGasPrice()

		const tokenContract = await this.ethereumContractService.createTokenContract(
			token.address,
			wallet.secretKey,
		)

		const transactionId = await this.ethereumContractService.transferTokens(
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
	@Get("wallet/token-data")
	async getTokenData(
		@Query(QueryTokenDataPipe) queryTokenDataDto: QueryTokenDataDto,
	): Promise<GetTokenDataDto> {
		const tokens: TokenData[] = []

		for (const tokenAddress of queryTokenDataDto.tokenAddresses) {
			const token = await this.tokensRepository.findOne(Blockchain.Ethereum, tokenAddress)
			if (!token) {
				throw new NotFoundException(ERROR_TOKEN_NOT_FOUND)
			}

			const wallet = await this.walletsRepository.findOne({
				blockchain: Blockchain.Ethereum,
				address: queryTokenDataDto.walletAddress,
			})
			if (!wallet) {
				throw new NotFoundException(ERROR_WALLET_NOT_FOUND)
			}

			const tokenContract = await this.ethereumContractService.createTokenContract(
				token.address,
				wallet.secretKey,
			)

			const balance = await this.ethereumContractService.getTokenBalance(
				tokenContract,
				wallet.address,
				token.decimals,
			)

			tokens.push({
				address: wallet.address,
				balance: this.formatTokens(token, balance),
			})
		}

		return { tokens }
	}

	private formatTokens(token: Token, amount: BigNumber): string {
		return `${amount.toFixed(token.decimals)} ${token.symbol}`
	}
}
