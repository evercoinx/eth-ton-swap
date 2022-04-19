import { ArgumentMetadata, BadRequestException, Injectable, PipeTransform } from "@nestjs/common"
import { TonBlockchainProvider } from "src/ton/ton-blockchain.provider"
import { MintJettonsDto } from "../dto/mint-jettons.dto"

@Injectable()
export class MintJettonsPipe implements PipeTransform<any> {
	constructor(private readonly tonBlockchainProvider: TonBlockchainProvider) {}

	async transform(mintJettonsDto: MintJettonsDto, { metatype }: ArgumentMetadata) {
		if (!metatype || !this.validateMetaType(metatype)) {
			return mintJettonsDto
		}

		try {
			mintJettonsDto.adminAddress = this.tonBlockchainProvider.normalizeAddress(
				mintJettonsDto.adminAddress,
			)

			mintJettonsDto.destinationAddress = this.tonBlockchainProvider.normalizeAddress(
				mintJettonsDto.destinationAddress,
			)
		} catch (err: unknown) {
			throw new BadRequestException("An invalid address is specified")
		}

		return mintJettonsDto
	}

	private validateMetaType(metatype: any): boolean {
		const types = [String, Boolean, Number, Array, Object]
		return !types.includes(metatype)
	}
}
