import { ArgumentMetadata, BadRequestException, Injectable, PipeTransform } from "@nestjs/common"
import { AttachWalletDto } from "../dto/attach-wallet.dto"

@Injectable()
export class AttachWalletPipe implements PipeTransform<any> {
	async transform(attachWalletDto: AttachWalletDto, { metatype }: ArgumentMetadata) {
		if (!metatype || !this.validateMetaType(metatype)) {
			return attachWalletDto
		}

		if (attachWalletDto.mnemonic) {
			const wordCount = attachWalletDto.mnemonic.split(/\s+/)
			if (![12, 15, 18, 21, 24].includes(wordCount.length)) {
				throw new BadRequestException("An invalid mnemonic specified")
			}
		}

		return attachWalletDto
	}

	private validateMetaType(metatype: any): boolean {
		const types = [String, Boolean, Number, Array, Object]
		return !types.includes(metatype)
	}
}