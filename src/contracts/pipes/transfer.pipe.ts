import { ArgumentMetadata, BadRequestException, Injectable, PipeTransform } from "@nestjs/common"
import { TonBlockchainProvider } from "src/ton/ton-blockchain.provider"
import { TransferDto } from "../dto/transfer.dto"

@Injectable()
export class TransferPipe implements PipeTransform<any> {
	constructor(private readonly tonBlockchainProvider: TonBlockchainProvider) {}

	async transform(deployContractDto: TransferDto, { metatype }: ArgumentMetadata) {
		if (!metatype || !this.validateMetaType(metatype)) {
			return deployContractDto
		}

		try {
			deployContractDto.sourceAddress = this.tonBlockchainProvider.normalizeAddress(
				deployContractDto.sourceAddress,
			)
		} catch (err: unknown) {
			throw new BadRequestException(`An invalid source address is specified`)
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
