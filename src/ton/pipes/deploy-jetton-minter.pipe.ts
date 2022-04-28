import { ArgumentMetadata, BadRequestException, Injectable, PipeTransform } from "@nestjs/common"
import { TonBlockchainProvider } from "src/ton/ton-blockchain.provider"
import { DeployJettonMinterDto } from "../dto/deploy-jetton-minter.dto"

@Injectable()
export class DeployJettonMinterPipe implements PipeTransform<any> {
	constructor(private readonly tonBlockchainProvider: TonBlockchainProvider) {}

	async transform(deployJettonMinterDto: DeployJettonMinterDto, { metatype }: ArgumentMetadata) {
		if (!metatype || !this.validateMetaType(metatype)) {
			return deployJettonMinterDto
		}

		try {
			deployJettonMinterDto.adminWalletAddress = this.tonBlockchainProvider.normalizeAddress(
				deployJettonMinterDto.adminWalletAddress,
			)
		} catch (err: unknown) {
			throw new BadRequestException(`Invalid admin wallet address is specified`)
		}

		return deployJettonMinterDto
	}

	private validateMetaType(metatype: any): boolean {
		const types = [String, Boolean, Number, Array, Object]
		return !types.includes(metatype)
	}
}
