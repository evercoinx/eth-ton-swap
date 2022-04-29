import { ArgumentMetadata, BadRequestException, Injectable, PipeTransform } from "@nestjs/common"
import { TonBlockchainProvider } from "src/ton/ton-blockchain.provider"
import { BurnJettonsDto } from "../dto/burn-jettons.dto"

@Injectable()
export class BurnJettonsPipe implements PipeTransform<any> {
	constructor(private readonly tonBlockchainProvider: TonBlockchainProvider) {}

	async transform(burnJettonsDto: BurnJettonsDto, { metatype }: ArgumentMetadata) {
		if (!metatype || !this.validateMetaType(metatype)) {
			return burnJettonsDto
		}

		try {
			burnJettonsDto.ownerWalletAddress = this.tonBlockchainProvider.normalizeAddress(
				burnJettonsDto.ownerWalletAddress,
			)
		} catch (err: unknown) {
			throw new BadRequestException(`Invalid address is specified`)
		}

		return burnJettonsDto
	}

	private validateMetaType(metatype: any): boolean {
		const types = [String, Boolean, Number, Array, Object]
		return !types.includes(metatype)
	}
}
