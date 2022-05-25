import { ArgumentMetadata, BadRequestException, Injectable, PipeTransform } from "@nestjs/common"
import { ERROR_UNACCEPTABLE_WALLET_TYPE } from "src/common/constants"
import { BaseValidationPipe } from "src/common/pipes/base-validation.pipe"
import { CreateWalletDto } from "../dto/create-wallet.dto"
import { WalletType } from "../enums/wallet-type.enum"

@Injectable()
export class CreateWalletPipe
	extends BaseValidationPipe
	implements PipeTransform<CreateWalletDto, Promise<CreateWalletDto>>
{
	async transform(createWalletDto: CreateWalletDto, { metatype }: ArgumentMetadata) {
		if (!metatype || !this.validateMetaType(metatype)) {
			return createWalletDto
		}

		if ([WalletType.Giver, WalletType.Minter].includes(createWalletDto.type)) {
			throw new BadRequestException(ERROR_UNACCEPTABLE_WALLET_TYPE)
		}
		return createWalletDto
	}
}
