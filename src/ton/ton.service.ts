import { Inject, Injectable, Logger } from "@nestjs/common"
import { BigNumber } from "nestjs-ethers"
import { contract, HttpProvider, providers, Wallets, utils } from "tonweb"
import nacl from "tweetnacl"
import { TON_MODULE_OPTIONS } from "./constants"
import { GetBlock } from "./interfaces/get-block.interface"
import { SendMode } from "./interfaces/send-mode.interface"
import { TonModuleOptions } from "./interfaces/ton-module-options.interface"
import { TonWalletData } from "./interfaces/ton-wallet-data.interface"

@Injectable()
export class TonService {
	private readonly logger = new Logger(TonService.name)
	private readonly httpProvider: providers.HttpProvider
	private readonly Wallet: typeof contract.WalletContract
	private readonly workchain: number

	constructor(@Inject(TON_MODULE_OPTIONS) options: TonModuleOptions) {
		const host = `https://${options.isTestnet ? "testnet." : ""}toncenter.com/api/v2/jsonRPC`
		const apiKey = options.isTestnet
			? "2261a804ce64c4558f74e86b68b0177cc7d9e3f795e664d3eda664649f20bbc5"
			: ""
		this.httpProvider = new HttpProvider(host, { apiKey })

		const wallets = new Wallets(this.httpProvider)
		this.Wallet = wallets.all[options.walletVersion]
	}

	createRandomWallet(): TonWalletData {
		const keyPair = nacl.sign.keyPair()
		const wallet = this.newWallet(keyPair.publicKey)
		return {
			wallet,
			secretKey: this.bytesToHex(keyPair.secretKey),
		}
	}

	async transfer(
		secretKey: string,
		recipientAddress: string,
		amount: string,
		memo: string,
	): Promise<boolean> {
		const keyPair = nacl.sign.keyPair.fromSecretKey(this.hexToBytes(secretKey))
		const wallet = this.newWallet(keyPair.publicKey)

		const seqno = await (
			wallet.methods.seqno() as contract.MethodCallerRequest<BigNumber>
		).call()
		if (seqno == null) {
			this.logger.error(`Wallet sequence number is undefined`)
			return false
		}

		const amountNano = utils.toNano(amount)
		const request = wallet.methods.transfer({
			secretKey: keyPair.secretKey,
			toAddress: recipientAddress,
			amount: amountNano,
			seqno,
			payload: memo,
			sendMode: SendMode.SenderPaysForwardFees | SendMode.IgnoreErrors,
		}) as contract.MethodSenderRequest

		const response = await request.send()
		if (response["@type"] === "error") {
			this.logger.error(`Code: ${response.code}, message: ${response.message}`)
			return false
		}
		return true
	}

	async getTransactionHash(address: string, timestamp: number): Promise<string | undefined> {
		const response = await this.httpProvider.getTransactions(address, 1)
		if (!Array.isArray(response)) {
			this.logger.error(`Code: ${response.code}, message: ${response.message}`)
			return
		}

		for (const transaction of response) {
			if (
				transaction.utime * 1000 >= timestamp &&
				transaction.in_msg.destination === address
			) {
				return transaction.transaction_id.hash
			}
		}
		return
	}

	async getBlock(): Promise<GetBlock | undefined> {
		const response = await this.httpProvider.getMasterchainInfo()
		if (response["@type"] === "error") {
			this.logger.error(`Code: ${response.code}, message: ${response.message}`)
			return
		}

		const block = response.last
		return {
			workchain: block.workchain,
			shard: block.shard,
			number: block.seqno,
		}
	}

	private newWallet(publicKey: Uint8Array): contract.WalletContract {
		return new this.Wallet(this.httpProvider, {
			publicKey,
			wc: this.workchain,
		})
	}

	private bytesToHex(bytes: Uint8Array): string {
		return Buffer.from(bytes).toString("hex")
	}

	private hexToBytes(hex: string): Uint8Array {
		return Uint8Array.from(Buffer.from(hex, "hex"))
	}
}
