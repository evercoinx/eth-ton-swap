export interface PriceConversion {
	status: {
		error_code: string
		error_message: string
	}
	data: {
		quote: Array<{
			price: number
		}>
	}
}
