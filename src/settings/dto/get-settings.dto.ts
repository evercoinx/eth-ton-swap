class GetFeesDto {
	[blockchain: string]: {
		gasFee: string
	}
}

class GetLimitsDto {
	[token: string]: {
		minAmount: string
		maxAmount: string
	}
}

export class GetSettingsDto {
	fees?: GetFeesDto
	limits?: GetLimitsDto
	swapFee: number
}
