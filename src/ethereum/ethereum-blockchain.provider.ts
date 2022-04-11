import { Injectable } from "@nestjs/common"
import { getAddress } from "nestjs-ethers"

@Injectable()
export class EthereumBlockchainProvider {
	normalizeAddress(address: string): string {
		return getAddress(address).replace(/^0x/, "")
	}
}
