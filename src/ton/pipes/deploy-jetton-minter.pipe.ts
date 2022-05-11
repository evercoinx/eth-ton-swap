import { ArgumentMetadata, BadRequestException, Injectable, PipeTransform } from "@nestjs/common"
import { TonBlockchainService } from "src/ton/providers/ton-blockchain.service"
import { DeployJettonMinterDto } from "../dto/deploy-jetton-minter.dto"

@Injectable()
export class DeployJettonMinterPipe implements PipeTransform<any> {
	constructor(private readonly tonBlockchain: TonBlockchainService) {}

	async transform(deployJettonMinterDto: DeployJettonMinterDto, { metatype }: ArgumentMetadata) {
		if (!metatype || !this.validateMetaType(metatype)) {
			return deployJettonMinterDto
		}

		try {
			deployJettonMinterDto.adminWalletAddress = this.tonBlockchain.normalizeAddress(
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
