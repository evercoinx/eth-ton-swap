import { ArgumentMetadata, Injectable, PipeTransform } from "@nestjs/common"
import { ERROR_INVALID_ADDRESS } from "src/common/constants"
import { BadRequestException } from "src/common/exceptions/bad-request.exception"
import { TonBlockchainService } from "src/ton/providers/ton-blockchain.service"
import { DeployWalletDto } from "../dto/deploy-wallet.dto"

@Injectable()
export class DeployWalletPipe implements PipeTransform<any> {
	constructor(private readonly tonBlockchainService: TonBlockchainService) {}

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

	private validateMetaType(metatype: any): boolean {
		const types = [String, Boolean, Number, Array, Object]
		return !types.includes(metatype)
	}
}
