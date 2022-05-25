import { ArgumentMetadata, BadRequestException, Injectable, PipeTransform } from "@nestjs/common"
import { ERROR_INVALID_MNEMONIC } from "src/common/constants"
import { BaseValidationPipe } from "src/common/pipes/base-validation.pipe"
import { SecurityService } from "src/common/providers/security.service"
import { AttachWalletDto } from "../dto/attach-wallet.dto"

@Injectable()
export class AttachWalletPipe
	extends BaseValidationPipe
	implements PipeTransform<AttachWalletDto, Promise<AttachWalletDto>>
{
	constructor(private readonly securityService: SecurityService) {
		super()
	}

	async transform(attachWalletDto: AttachWalletDto, { metatype }: ArgumentMetadata) {
		if (!metatype || !this.validateMetaType(metatype)) {
			return attachWalletDto
		}

		attachWalletDto.secretKey = await this.securityService.encryptText(
			attachWalletDto.secretKey,
		)

		if (attachWalletDto.mnemonic) {
			const wordCount = attachWalletDto.mnemonic.split(/\s+/)
			if (![12, 15, 18, 21, 24].includes(wordCount.length)) {
				throw new BadRequestException(ERROR_INVALID_MNEMONIC)
			}
			attachWalletDto.mnemonic = await this.securityService.encryptText(
				attachWalletDto.mnemonic,
			)
		}

		return attachWalletDto
	}
}
