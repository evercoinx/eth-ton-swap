import { AddressType } from "tonweb/dist/types/utils/address"

export interface MinterData {
	totalSupply: string
	minterAddress: AddressType
	adminAddress: AddressType
	jettonContentUri: string
	isMutable: boolean
}
