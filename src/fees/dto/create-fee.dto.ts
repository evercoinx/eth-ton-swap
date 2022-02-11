import { Blockchain } from "../fee.entity"

export class CreateFeeDto {
	blockchain: Blockchain
	maxFeePerGas: string
	maxPriorityFeePerGas: string
	gasPrice: string
}
