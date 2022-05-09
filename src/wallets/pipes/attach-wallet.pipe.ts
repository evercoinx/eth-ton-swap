import { ArgumentMetadata, Injectable, PipeTransform } from "@nestjs/common"
import { ERROR_INVALID_MNEMONIC } from "src/common/constants"
import { BadRequestException } from "src/common/exceptions/bad-request.exception"
import { SecurityService } from "src/common/providers/security.service"
import { AttachWalletDto } from "../dto/attach-wallet.dto"

@Injectable()
export class AttachWalletPipe implements PipeTransform<any> {
	constructor(private readonly security: SecurityService) {}

	async transform(attachWalletDto: AttachWalletDto, { metatype }: ArgumentMetadata) {
		if (!metatype || !this.validateMetaType(metatype)) {
			return attachWalletDto
		}

		attachWalletDto.secretKey = await this.security.encryptText(attachWalletDto.secretKey)

		if (attachWalletDto.mnemonic) {
			attachWalletDto.mnemonic = await this.security.encryptText(attachWalletDto.mnemonic)

			const wordCount = attachWalletDto.mnemonic.split(/\s+/)
			if (![12, 15, 18, 21, 24].includes(wordCount.length)) {
				throw new BadRequestException(ERROR_INVALID_MNEMONIC)
			}
		}

		return attachWalletDto
	}

	private validateMetaType(metatype: any): boolean {
		const types = [String, Boolean, Number, Array, Object]
		return !types.includes(metatype)
	}
}
