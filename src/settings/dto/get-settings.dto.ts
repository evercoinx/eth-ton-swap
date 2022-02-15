import { GetFeesDto } from "src/fees/dto/get-fees.dto"

export class GetSettingsDto {
	fees: GetFeesDto
	minSwapAmount: number
	maxSwapAmount: number
}
