import { ArgumentMetadata, BadRequestException, Injectable, PipeTransform } from "@nestjs/common"
import { CreateWalletDto } from "../dto/create-wallet.dto"

@Injectable()
export class CreateWalletPipe implements PipeTransform<any> {
	async transform(createWalletDto: CreateWalletDto, { metatype }: ArgumentMetadata) {
		if (!metatype || !this.validateMetaType(metatype)) {
			return createWalletDto
		}

		if (
			(createWalletDto.secretKey && !createWalletDto.address) ||
			(!createWalletDto.secretKey && createWalletDto.address)
		) {
			throw new BadRequestException("A secret key and an address must be specified together")
		}

		if (createWalletDto.mnemonic) {
			const wordCount = createWalletDto.mnemonic.split(/\s+/)
			if (![12, 15, 18, 21, 24].includes(wordCount.length)) {
				throw new BadRequestException("An invalid mnemonic specified")
			}
		}

		return createWalletDto
	}

	private validateMetaType(metatype: any): boolean {
		const types = [String, Boolean, Number, Array, Object]
		return !types.includes(metatype)
	}
}
