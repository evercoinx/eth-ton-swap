import { AddressType } from "tonweb/dist/types/utils/address"

export interface MinterInfo {
	totalSupply: string
	minterAddress: AddressType
	adminAddress: AddressType
}
