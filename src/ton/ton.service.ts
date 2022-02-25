import { Inject, Injectable } from "@nestjs/common"
import { options } from "joi"
import { contract, HttpProvider, providers, Wallets } from "tonweb"
import nacl from "tweetnacl"
import { TON_MODULE_OPTIONS } from "./constants"
import { TonModuleOptions } from "./interfaces/ton-module-options.interface"
import { TonWalletData } from "./interfaces/ton-wallet-data"

@Injectable()
export class TonService {
	private readonly wallet: typeof contract.WalletContract
	private readonly workchain: number
	private readonly httpProvider: providers.HttpProvider

	constructor(@Inject(TON_MODULE_OPTIONS) options: TonModuleOptions) {
		const host = `https://${options.isTestnet ? "testnet." : ""}toncenter.com/api/v2/jsonRPC`
		this.httpProvider = new HttpProvider(host)

		const wallets = new Wallets(this.httpProvider)
		this.wallet = wallets.all[options.walletVersion]
	}

	createRandomWallet(): TonWalletData {
		const keyPair = nacl.sign.keyPair()
		const tonWallet = new this.wallet(this.httpProvider, {
			publicKey: keyPair.publicKey,
			wc: this.workchain,
		})

		return {
			wallet: tonWallet,
			secretKey: Buffer.from(keyPair.secretKey).toString("hex"),
		}
	}
}
