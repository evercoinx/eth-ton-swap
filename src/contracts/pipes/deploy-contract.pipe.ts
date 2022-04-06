import { ArgumentMetadata, BadRequestException, Injectable, PipeTransform } from "@nestjs/common"
import { TonBlockchainProvider } from "src/ton/ton-blockchain.provider"
import { DeployContractDto } from "../dto/deploy-contract.dto"

@Injectable()
export class DeployContractPipe implements PipeTransform<any> {
	constructor(private readonly tonBlockchainProvider: TonBlockchainProvider) {}

	async transform(deployContractDto: DeployContractDto, { metatype }: ArgumentMetadata) {
		if (!metatype || !this.validateMetaType(metatype)) {
			return deployContractDto
		}

		try {
			deployContractDto.address = this.tonBlockchainProvider.normalizeAddress(
				deployContractDto.address,
			)
		} catch (err: unknown) {
			throw new BadRequestException(`An invalid address is specified`)
		}

		return deployContractDto
	}

	private validateMetaType(metatype: any): boolean {
		const types = [String, Boolean, Number, Array, Object]
		return !types.includes(metatype)
	}
}
