import BigNumber from "bignumber.js"

export class Quantity {
	private readonly quantity: BigNumber
	private readonly decimals: number

	constructor(quantity: BigNumber | string | number, decimals: number) {
		this.quantity = new BigNumber(quantity)
		this.decimals = decimals
	}

	toString(): string {
		return this.quantity.toFixed(this.decimals)
	}
}
