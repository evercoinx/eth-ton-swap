import { Injectable } from "@nestjs/common"
import { EthersSigner, InjectSignerProvider } from "nestjs-ethers"
import { WalletSigner } from "./interfaces/wallet-signer.interface"

@Injectable()
export class EthereumConractProvider {
	constructor(@InjectSignerProvider() private readonly ethersSigner: EthersSigner) {}

	createRandomWalletSigner(): WalletSigner {
		const wallet = this.ethersSigner.createRandomWallet()
		const secretKey = wallet.privateKey.replace(/^0x/, "")
		return {
			wallet,
			secretKey,
		}
	}
}
