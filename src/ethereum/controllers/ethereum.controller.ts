import { Body, Controller, Get, Logger, Put, Query, UseGuards } from "@nestjs/common"
import BigNumber from "bignumber.js"
import { JwtAuthGuard } from "src/auth/guards/jwt-auth.guard"
import { ERROR_TOKEN_NOT_FOUND, ERROR_WALLET_NOT_FOUND } from "src/common/constants"
import { Blockchain } from "src/common/enums/blockchain.enum"
import { NotFoundException } from "src/common/exceptions/not-found.exception"
import { Token } from "src/tokens/token.entity"
import { TokensRepository } from "src/tokens/providers/tokens.repository"
import { WalletsRepository } from "src/wallets/providers/wallets.repository"
import { GetTransactionResultDto } from "../dto/get-transaction-result.dto"
import { GetTokenWalletDataDto } from "../dto/get-token-wallet-data.dto"
import { QueryTokenWalletDataDto } from "../dto/query-token-wallet-data.dto"
import { TransferEthersDto } from "../dto/transfer-ethers.dto"
import { TransferTokensDto } from "../dto/transfer-tokens.dto"
import { TokenData } from "../interfaces/token-data.interface"
import { TransferEthersPipe } from "../pipes/transfer-ethers.pipe"
import { TransferTokensPipe } from "../pipes/transfer-tokens.pipe"
import { EthereumBlockchainService } from "../providers/ethereum-blockchain.service"
import { EthereumConractService } from "../providers/ethereum-contract.service"

@Controller("ethereum")
export class EthereumController {
	private readonly logger = new Logger(EthereumController.name)

	constructor(
		private readonly ethereumBlockchain: EthereumBlockchainService,
		private readonly ethereumContract: EthereumConractService,
		private readonly tokensRepository: TokensRepository,
		private readonly walletsRepository: WalletsRepository,
	) {}

	@UseGuards(JwtAuthGuard)
	@Put(`wallet/transfer-ethers`)
	async transferEthers(
		@Body(TransferEthersPipe) transferEthersDto: TransferEthersDto,
	): Promise<GetTransactionResultDto> {
		const wallet = await this.walletsRepository.findOne(
			Blockchain.Ethereum,
			transferEthersDto.sourceAddress,
		)
		if (!wallet) {
			throw new NotFoundException(ERROR_WALLET_NOT_FOUND)
		}

		const walletSigner = await this.ethereumContract.createWalletSigner(wallet.secretKey)

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
		const token = await this.tokensRepository.findOne(
			Blockchain.Ethereum,
			transferTokensDto.tokenAddress,
		)
		if (!token) {
			throw new NotFoundException(ERROR_TOKEN_NOT_FOUND)
		}

		const wallet = await this.walletsRepository.findOne(
			Blockchain.Ethereum,
			transferTokensDto.sourceAddress,
		)
		if (!wallet) {
			throw new NotFoundException(ERROR_WALLET_NOT_FOUND)
		}

		const gasPrice = await this.ethereumBlockchain.getGasPrice()

		const tokenContract = await this.ethereumContract.createTokenContract(
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
			const token = await this.tokensRepository.findOne(Blockchain.Ethereum, tokenAddress)
			if (!token) {
				throw new NotFoundException(ERROR_TOKEN_NOT_FOUND)
			}

			const wallet = await this.walletsRepository.findOne(
				Blockchain.Ethereum,
				queryTokenWalletDataDto.walletAddress,
			)
			if (!wallet) {
				throw new NotFoundException(ERROR_WALLET_NOT_FOUND)
			}

			const tokenContract = await this.ethereumContract.createTokenContract(
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
