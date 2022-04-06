import { ArgumentMetadata, BadRequestException, Injectable, PipeTransform } from "@nestjs/common"
import { TonBlockchainProvider } from "src/ton/ton-blockchain.provider"
import { MintJettonsDto } from "../dto/mint-jettons.dto"

@Injectable()
export class MintJettonsPipe implements PipeTransform<any> {
	constructor(private readonly tonBlockchainProvider: TonBlockchainProvider) {}

	async transform(deployContractDto: MintJettonsDto, { metatype }: ArgumentMetadata) {
		if (!metatype || !this.validateMetaType(metatype)) {
			return deployContractDto
		}

		try {
			deployContractDto.adminAddress = this.tonBlockchainProvider.normalizeAddress(
				deployContractDto.adminAddress,
			)
		} catch (err: unknown) {
			throw new BadRequestException(`An invalid admin address is specified`)
		}

		try {
			deployContractDto.destinationAddress = this.tonBlockchainProvider.normalizeAddress(
				deployContractDto.destinationAddress,
			)
		} catch (err: unknown) {
			throw new BadRequestException(`An invalid destination address is specified`)
		}

		return deployContractDto
	}

	private validateMetaType(metatype: any): boolean {
		const types = [String, Boolean, Number, Array, Object]
		return !types.includes(metatype)
	}
}
