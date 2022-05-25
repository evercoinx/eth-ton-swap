import { ArgumentMetadata, BadRequestException, Injectable, PipeTransform } from "@nestjs/common"
import { BaseValidationPipe } from "src/common/pipes/base-validation.pipe"
import { TonBlockchainService } from "src/ton/providers/ton-blockchain.service"
import { BurnJettonsDto } from "../dto/burn-jettons.dto"

@Injectable()
export class BurnJettonsPipe
	extends BaseValidationPipe
	implements PipeTransform<BurnJettonsDto, Promise<BurnJettonsDto>>
{
	constructor(private readonly tonBlockchainProvider: TonBlockchainService) {
		super()
	}

	async transform(burnJettonsDto: BurnJettonsDto, { metatype }: ArgumentMetadata) {
		if (!metatype || !this.validateMetaType(metatype)) {
			return burnJettonsDto
		}

		try {
			burnJettonsDto.minterAdminWalletAddress = this.tonBlockchainProvider.normalizeAddress(
				burnJettonsDto.minterAdminWalletAddress,
			)

			burnJettonsDto.ownerWalletAddress = this.tonBlockchainProvider.normalizeAddress(
				burnJettonsDto.ownerWalletAddress,
			)
		} catch (err: unknown) {
			throw new BadRequestException(`Invalid address is specified`)
		}

		return burnJettonsDto
	}
}
