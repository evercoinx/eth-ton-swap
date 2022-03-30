import BigNumber from "bignumber.js"
import { AddressType } from "tonweb/dist/types/utils/address"

export interface MinterData {
	totalSupply: string
	minterAddress: AddressType
	minterBalance: BigNumber
	adminAddress: AddressType
	adminBalance: BigNumber
	jettonContentUri: string
	isMutable: boolean
}
