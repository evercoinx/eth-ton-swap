import { ArgumentMetadata, BadRequestException, Injectable, PipeTransform } from "@nestjs/common"
import { TonBlockchainProvider } from "src/ton/ton-blockchain.provider"
import { TransferDto } from "../dto/transfer.dto"

@Injectable()
export class TransferPipe implements PipeTransform<any> {
	constructor(private readonly tonBlockchainProvider: TonBlockchainProvider) {}

	async transform(transferDto: TransferDto, { metatype }: ArgumentMetadata) {
		if (!metatype || !this.validateMetaType(metatype)) {
			return transferDto
		}

		try {
			transferDto.sourceAddress = this.tonBlockchainProvider.normalizeAddress(
				transferDto.sourceAddress,
			)
		} catch (err: unknown) {
			throw new BadRequestException(`An invalid source address is specified`)
		}

		try {
			transferDto.destinationAddress = this.tonBlockchainProvider.normalizeAddress(
				transferDto.destinationAddress,
			)
		} catch (err: unknown) {
			throw new BadRequestException(`An invalid destination address is specified`)
		}

		return transferDto
	}

	private validateMetaType(metatype: any): boolean {
		const types = [String, Boolean, Number, Array, Object]
		return !types.includes(metatype)
	}
}
