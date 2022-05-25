import { ArgumentMetadata, BadRequestException, Injectable, PipeTransform } from "@nestjs/common"
import { ERROR_JETTON_MINTER_ADMIN_WALLET_NOT_FOUND } from "src/common/constants"
import { BaseValidationPipe } from "src/common/pipes/base-validation.pipe"
import { TonBlockchainService } from "src/ton/providers/ton-blockchain.service"
import { DeployJettonMinterDto } from "../dto/deploy-jetton-minter.dto"

@Injectable()
export class DeployJettonMinterPipe
	extends BaseValidationPipe
	implements PipeTransform<DeployJettonMinterDto, Promise<DeployJettonMinterDto>>
{
	constructor(private readonly tonBlockchainService: TonBlockchainService) {
		super()
	}

	async transform(deployJettonMinterDto: DeployJettonMinterDto, { metatype }: ArgumentMetadata) {
		if (!metatype || !this.validateMetaType(metatype)) {
			return deployJettonMinterDto
		}

		try {
			deployJettonMinterDto.adminWalletAddress = this.tonBlockchainService.normalizeAddress(
				deployJettonMinterDto.adminWalletAddress,
			)
		} catch (err: unknown) {
			throw new BadRequestException(ERROR_JETTON_MINTER_ADMIN_WALLET_NOT_FOUND)
		}

		return deployJettonMinterDto
	}
}
