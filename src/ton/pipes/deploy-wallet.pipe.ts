import { ArgumentMetadata, BadRequestException, Injectable, PipeTransform } from "@nestjs/common"
import { TonBlockchainProvider } from "src/ton/ton-blockchain.provider"
import { DeployWalletDto } from "../dto/deploy-wallet.dto"

@Injectable()
export class DeployWalletPipe implements PipeTransform<any> {
	constructor(private readonly tonBlockchainProvider: TonBlockchainProvider) {}

	async transform(deployWalletDto: DeployWalletDto, { metatype }: ArgumentMetadata) {
		if (!metatype || !this.validateMetaType(metatype)) {
			return deployWalletDto
		}

		try {
			deployWalletDto.address = this.tonBlockchainProvider.normalizeAddress(
				deployWalletDto.address,
			)
		} catch (err: unknown) {
			throw new BadRequestException(`Invalid address is specified`)
		}

		return deployWalletDto
	}

	private validateMetaType(metatype: any): boolean {
		const types = [String, Boolean, Number, Array, Object]
		return !types.includes(metatype)
	}
}
