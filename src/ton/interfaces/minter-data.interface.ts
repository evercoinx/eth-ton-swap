import BigNumber from "bignumber.js"
import { AddressType } from "tonweb/dist/types/utils/address"

export interface MinterData {
	totalSupply: BigNumber
	minterAddress: AddressType
	minterBalance: BigNumber
	adminAddress: AddressType
	adminBalance: BigNumber
	jettonContentUri: string
	isMutable: boolean
}
