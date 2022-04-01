import BigNumber from "bignumber.js"
import { Address } from "tonweb/dist/types/utils/address"

export interface MinterData {
	totalSupply: BigNumber
	minterAddress: Address
	minterBalance: BigNumber
	adminAddress: Address
	adminBalance: BigNumber
	jettonContentUri: string
	isMutable: boolean
}
