import { IsUUID } from "class-validator"

export class BurnJettonsDto {
	@IsUUID(4)
	swapId: string
}
