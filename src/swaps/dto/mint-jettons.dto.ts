import { IsUUID } from "class-validator"

export class MintJettonsDto {
	@IsUUID(4)
	swapId: string
}
