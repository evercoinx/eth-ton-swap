import { ArgumentMetadata, BadRequestException, Injectable, PipeTransform } from "@nestjs/common"
import { TonBlockchainProvider } from "src/ton/ton-blockchain.provider"
import { QueryContractAddressDto } from "../dto/query-contract-address.dto"

@Injectable()
export class QueryContractAddressPipe implements PipeTransform<any> {
	constructor(private readonly tonBlockchainProvider: TonBlockchainProvider) {}

	async transform(
		queryContractAddressDto: QueryContractAddressDto,
		{ metatype }: ArgumentMetadata,
	) {
		if (!metatype || !this.validateMetaType(metatype)) {
			return queryContractAddressDto
		}

		try {
			queryContractAddressDto.adminWalletAddress =
				this.tonBlockchainProvider.normalizeAddress(
					queryContractAddressDto.adminWalletAddress,
				)

			queryContractAddressDto.ownerWalletAddress =
				this.tonBlockchainProvider.normalizeAddress(
					queryContractAddressDto.ownerWalletAddress,
				)
		} catch (err: unknown) {
			throw new BadRequestException(`An invalid address is specified`)
		}

		return queryContractAddressDto
	}

	private validateMetaType(metatype: any): boolean {
		const types = [String, Boolean, Number, Array, Object]
		return !types.includes(metatype)
	}
}
