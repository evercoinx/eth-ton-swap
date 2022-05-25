import { ArgumentMetadata, BadRequestException, Injectable, PipeTransform } from "@nestjs/common"
import { ERROR_INVALID_ADDRESS } from "src/common/constants"
import { BaseValidationPipe } from "src/common/pipes/base-validation.pipe"
import { TonBlockchainService } from "src/ton/providers/ton-blockchain.service"
import { TransferToncoinsDto } from "../dto/transfer-toncoins dto"

@Injectable()
export class TransferToncoinsPipe
	extends BaseValidationPipe
	implements PipeTransform<TransferToncoinsDto, Promise<TransferToncoinsDto>>
{
	constructor(private readonly tonBlockchainService: TonBlockchainService) {
		super()
	}

	async transform(transferToncoinsDto: TransferToncoinsDto, { metatype }: ArgumentMetadata) {
		if (!metatype || !this.validateMetaType(metatype)) {
			return transferToncoinsDto
		}

		try {
			transferToncoinsDto.sourceAddress = this.tonBlockchainService.normalizeAddress(
				transferToncoinsDto.sourceAddress,
			)

			transferToncoinsDto.destinationAddress = this.tonBlockchainService.normalizeAddress(
				transferToncoinsDto.destinationAddress,
			)
		} catch (err: unknown) {
			throw new BadRequestException(ERROR_INVALID_ADDRESS)
		}

		return transferToncoinsDto
	}
}
