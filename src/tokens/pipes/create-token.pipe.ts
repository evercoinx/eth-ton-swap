import { ArgumentMetadata, BadRequestException, Injectable, PipeTransform } from "@nestjs/common"
import BigNumber from "bignumber.js"
import { ERROR_INVALID_ADDRESS } from "src/common/constants"
import { Blockchain } from "src/common/enums/blockchain.enum"
import { BaseValidationPipe } from "src/common/pipes/base-validation.pipe"
import { EthereumBlockchainService } from "src/ethereum/providers/ethereum-blockchain.service"
import { TonBlockchainService } from "src/ton/providers/ton-blockchain.service"
import { CreateTokenDto } from "../dto/create-token.dto"

@Injectable()
export class CreateTokenPipe
	extends BaseValidationPipe
	implements PipeTransform<CreateTokenDto, Promise<CreateTokenDto>>
{
	constructor(
		private readonly ethereumBlockchainService: EthereumBlockchainService,
		private readonly tonBlockchainService: TonBlockchainService,
	) {
		super()
	}

	async transform(createTokenDto: CreateTokenDto, { metatype }: ArgumentMetadata) {
		if (!metatype || !this.validateMetaType(metatype)) {
			return createTokenDto
		}

		try {
			switch (createTokenDto.blockchain) {
				case Blockchain.Ethereum: {
					createTokenDto.address = this.ethereumBlockchainService.normalizeAddress(
						createTokenDto.address,
					)
					break
				}
				case Blockchain.TON: {
					createTokenDto.address = this.tonBlockchainService.normalizeAddress(
						createTokenDto.address,
					)
					createTokenDto.conjugatedAddress = this.tonBlockchainService.normalizeAddress(
						createTokenDto.conjugatedAddress,
					)
					break
				}
			}
		} catch (err: unknown) {
			throw new BadRequestException(ERROR_INVALID_ADDRESS)
		}

		createTokenDto.minSwapAmount = new BigNumber(createTokenDto.minSwapAmount).toFixed(
			createTokenDto.decimals,
		)

		createTokenDto.maxSwapAmount = new BigNumber(createTokenDto.maxSwapAmount).toFixed(
			createTokenDto.decimals,
		)

		return createTokenDto
	}
}
