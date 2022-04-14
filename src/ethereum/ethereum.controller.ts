import {
	BadRequestException,
	Body,
	Controller,
	Logger,
	NotFoundException,
	Param,
	Put,
	UseGuards,
} from "@nestjs/common"
import BigNumber from "bignumber.js"
import { JwtAuthGuard } from "src/auth/guards/jwt-auth.guard"
import { Blockchain } from "src/tokens/token.entity"
import { TokensService } from "src/tokens/tokens.service"
import { WalletsService } from "src/wallets/wallets.service"
import { GetTransactionResultDto } from "../ethereum/dto/get-transaction-result.dto"
import { TransferDto } from "../ethereum/dto/transfer.dto"
import { EthereumBlockchainProvider } from "./ethereum-blockchain.provider"
import { EthereumConractProvider } from "./ethereum-contract.provider"

enum ContractType {
	Account = "account",
}

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
	@Put(":type/transfer")
	async transfer(
		@Param("type") contractType: ContractType,
		@Body() transferDto: TransferDto,
	): Promise<GetTransactionResultDto> {
		switch (contractType) {
			case ContractType.Account: {
				const token = await this.tokenService.findByBlockchainAndSymbol(
					Blockchain.Ethereum,
					"USDC",
				)
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

			default:
				throw new BadRequestException("Unexpected contract type")
		}
	}
}
