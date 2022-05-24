import { ArgumentMetadata, BadRequestException, Injectable, PipeTransform } from "@nestjs/common"
import { ERROR_UNACCEPTABLE_WALLET_TYPE } from "src/common/constants"
import { CreateWalletDto } from "../dto/create-wallet.dto"
import { WalletType } from "../enums/wallet-type.enum"

@Injectable()
export class CreateWalletPipe implements PipeTransform<any> {
	async transform(createWalletDto: CreateWalletDto, { metatype }: ArgumentMetadata) {
		if (!metatype || !this.validateMetaType(metatype)) {
			return createWalletDto
		}

		if ([WalletType.Giver, WalletType.Minter].includes(createWalletDto.type)) {
			throw new BadRequestException(ERROR_UNACCEPTABLE_WALLET_TYPE)
		}
		return createWalletDto
	}

	private validateMetaType(metatype: any): boolean {
		const types = [String, Boolean, Number, Array, Object]
		return !types.includes(metatype)
	}
}
