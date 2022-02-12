import { CreateTokenDto } from "./create-token.dto"

export class GetTokenDto extends CreateTokenDto {
	id: string
	updatedAt: number
}
