import BigNumber from "bignumber.js"
import { Address } from "tonweb/dist/types/utils/address"

export interface JettonMinterData {
	totalSupply: BigNumber
	jettonMinterAddress: Address
	jettonMinterBalance: BigNumber
	jettonContentUri: string
	isMutable: boolean
	adminWalletAddress: Address
	adminWalletBalance: BigNumber
}
