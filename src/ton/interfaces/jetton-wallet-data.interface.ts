import BigNumber from "bignumber.js"
import { Address } from "tonweb/dist/types/utils/address"

export interface JettonWalletData {
	balance: BigNumber
	ownerAddress: Address
	jettonMinterAddress: Address
}
