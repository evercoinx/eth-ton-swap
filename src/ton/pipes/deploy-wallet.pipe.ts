import { ArgumentMetadata, BadRequestException, Injectable, PipeTransform } from "@nestjs/common"
import { ERROR_INVALID_ADDRESS } from "src/common/constants"
import { BaseValidationPipe } from "src/common/pipes/base-validation.pipe"
import { TonBlockchainService } from "src/ton/providers/ton-blockchain.service"
import { DeployWalletDto } from "../dto/deploy-wallet.dto"

@Injectable()
export class DeployWalletPipe
	extends BaseValidationPipe
	implements PipeTransform<DeployWalletDto, Promise<DeployWalletDto>>
{
	constructor(private readonly tonBlockchainService: TonBlockchainService) {
		super()
	}

	async transform(deployWalletDto: DeployWalletDto, { metatype }: ArgumentMetadata) {
		if (!metatype || !this.validateMetaType(metatype)) {
			return deployWalletDto
		}

		try {
			deployWalletDto.address = this.tonBlockchainService.normalizeAddress(
				deployWalletDto.address,
			)
		} catch (err: unknown) {
			throw new BadRequestException(ERROR_INVALID_ADDRESS)
		}

		return deployWalletDto
	}
}
