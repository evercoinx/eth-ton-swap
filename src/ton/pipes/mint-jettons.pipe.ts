import { ArgumentMetadata, BadRequestException, Injectable, PipeTransform } from "@nestjs/common"
import { TonBlockchainService } from "src/ton/providers/ton-blockchain.service"
import { MintJettonsDto } from "../dto/mint-jettons.dto"

@Injectable()
export class MintJettonsPipe implements PipeTransform<any> {
	constructor(private readonly tonBlockchain: TonBlockchainService) {}

	async transform(mintJettonsDto: MintJettonsDto, { metatype }: ArgumentMetadata) {
		if (!metatype || !this.validateMetaType(metatype)) {
			return mintJettonsDto
		}

		try {
			mintJettonsDto.adminAddress = this.tonBlockchain.normalizeAddress(
				mintJettonsDto.adminAddress,
			)

			mintJettonsDto.destinationAddress = this.tonBlockchain.normalizeAddress(
				mintJettonsDto.destinationAddress,
			)
		} catch (err: unknown) {
			throw new BadRequestException("Invalid address is specified")
		}

		return mintJettonsDto
	}

	private validateMetaType(metatype: any): boolean {
		const types = [String, Boolean, Number, Array, Object]
		return !types.includes(metatype)
	}
}
