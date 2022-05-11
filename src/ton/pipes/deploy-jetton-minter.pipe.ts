import { ArgumentMetadata, Injectable, PipeTransform } from "@nestjs/common"
import { ERROR_JETTON_MINTER_ADMIN_WALLET_NOT_FOUND } from "src/common/constants"
import { BadRequestException } from "src/common/exceptions/bad-request.exception"
import { TonBlockchainService } from "src/ton/providers/ton-blockchain.service"
import { DeployJettonMinterDto } from "../dto/deploy-jetton-minter.dto"

@Injectable()
export class DeployJettonMinterPipe implements PipeTransform<any> {
	constructor(private readonly tonBlockchainService: TonBlockchainService) {}

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

	private validateMetaType(metatype: any): boolean {
		const types = [String, Boolean, Number, Array, Object]
		return !types.includes(metatype)
	}
}
