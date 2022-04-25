import BigNumber from "bignumber.js"
import { Address } from "tonweb/dist/types/utils/address"

export interface TransactionData {
	id: string
	sourceAddress?: Address
	destinationAddress?: Address
	amount: BigNumber
}
