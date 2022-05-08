import { ArgumentMetadata, BadRequestException, Injectable, PipeTransform } from "@nestjs/common"
import { TonBlockchainService } from "src/ton/providers/ton-blockchain.service"
import { TransferJettonsDto } from "../dto/transfer-jettons.dto"

@Injectable()
export class TransferJettonsPipe implements PipeTransform<any> {
	constructor(private readonly tonBlockchainProvider: TonBlockchainService) {}

	async transform(transferJettonsDto: TransferJettonsDto, { metatype }: ArgumentMetadata) {
		if (!metatype || !this.validateMetaType(metatype)) {
			return transferJettonsDto
		}

		try {
			transferJettonsDto.minterAdminWalletAddress =
				this.tonBlockchainProvider.normalizeAddress(
					transferJettonsDto.minterAdminWalletAddress,
				)

			transferJettonsDto.sourceAddress = this.tonBlockchainProvider.normalizeAddress(
				transferJettonsDto.sourceAddress,
			)

			transferJettonsDto.destinationAddress = this.tonBlockchainProvider.normalizeAddress(
				transferJettonsDto.destinationAddress,
			)
		} catch (err: unknown) {
			throw new BadRequestException(`Invalid address is specified`)
		}

		return transferJettonsDto
	}

	private validateMetaType(metatype: any): boolean {
		const types = [String, Boolean, Number, Array, Object]
		return !types.includes(metatype)
	}
}
