class GetFeesDto {
	[blockchain: string]: {
		gasFee: string
	}
}

export class GetSettingsDto {
	swapFee: number
	fees?: GetFeesDto
}
