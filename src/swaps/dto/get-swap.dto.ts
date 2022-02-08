import { CreateSwapDto } from "./create-swap.dto"

export class GetSwapDto extends CreateSwapDto {
	id: string
	registeredAt: number
}
