import { ArgumentMetadata, BadRequestException, Injectable, PipeTransform } from "@nestjs/common"
import { TonBlockchainService } from "src/ton/providers/ton-blockchain.service"
import { TransferToncoinsDto } from "../dto/transfer-toncoins dto"

@Injectable()
export class TransferToncoinsPipe implements PipeTransform<any> {
	constructor(private readonly tonBlockchain: TonBlockchainService) {}

	async transform(transferToncoinsDto: TransferToncoinsDto, { metatype }: ArgumentMetadata) {
		if (!metatype || !this.validateMetaType(metatype)) {
			return transferToncoinsDto
		}

		try {
			transferToncoinsDto.sourceAddress = this.tonBlockchain.normalizeAddress(
				transferToncoinsDto.sourceAddress,
			)

			transferToncoinsDto.destinationAddress = this.tonBlockchain.normalizeAddress(
				transferToncoinsDto.destinationAddress,
			)
		} catch (err: unknown) {
			throw new BadRequestException(`Invalid address is specified`)
		}

		return transferToncoinsDto
	}

	private validateMetaType(metatype: any): boolean {
		const types = [String, Boolean, Number, Array, Object]
		return !types.includes(metatype)
	}
}
