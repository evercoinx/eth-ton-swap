import { Inject, Injectable } from "@nestjs/common"
import { BigNumber } from "bignumber.js"
import { contract, HttpProvider, providers, Wallets, utils } from "tonweb"
import * as nacl from "tweetnacl"
import { TON_CONNECTION } from "./constants"
import { Block } from "./interfaces/block.interface"
import { SendMode } from "./interfaces/send-mode.interface"
import { TonModuleOptions } from "./interfaces/ton-module-options.interface"
import { TonWalletData } from "./interfaces/ton-wallet-data.interface"
import { Transaction } from "./interfaces/transaction.interface"

@Injectable()
export class TonService {
	private readonly httpProvider: providers.HttpProvider
	private readonly Wallet: typeof contract.WalletContract
	private readonly workchain: number

	constructor(@Inject(TON_CONNECTION) options: TonModuleOptions) {
		const host = `https://${
			options.blockchainId === "testnet" ? "testnet." : ""
		}toncenter.com/api/v2/jsonRPC`
		this.httpProvider = new HttpProvider(host, { apiKey: options.apiKey })

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
	): Promise<void> {
		const keyPair = nacl.sign.keyPair.fromSecretKey(this.hexToBytes(secretKey))
		const wallet = this.newWallet(keyPair.publicKey)

		const seqno = await (
			wallet.methods.seqno() as contract.MethodCallerRequest<BigNumber>
		).call()
		if (seqno == null) {
			throw new Error(`Wallet sequence number not defined`)
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
			throw new Error(`Code: ${response.code}, message: ${response.message}`)
		}
	}

	async getTransaction(
		address: string,
		amount: string,
		timestamp: number,
		isInput: boolean,
	): Promise<Transaction> {
		const response = await this.httpProvider.getTransactions(address, 1)
		if (!Array.isArray(response)) {
			throw new Error(`Code: ${response.code}, message: ${response.message}`)
		}

		for (const transaction of response) {
			if (this.checkTransaction(transaction, address, amount, timestamp, isInput)) {
				const message = isInput
					? transaction.in_msg
					: transaction.out_msgs.length > 0 && transaction.out_msgs[0]
				return {
					id: `${transaction.transaction_id.lt}:${transaction.transaction_id.hash}`,
					sourceAddress: message.source || undefined,
					destinationAddress: message.destination || undefined,
				}
			}
		}

		throw new Error("Transaction not found")
	}

	async getLatestBlock(): Promise<Block> {
		const response = await this.httpProvider.getMasterchainInfo()
		if (response["@type"] === "error") {
			throw new Error(`Code: ${response.code}, message: ${response.message}`)
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

	private checkTransaction(
		transaction: providers.Transaction,
		address: string,
		amount: string,
		timestamp: number,
		isInput: boolean,
	): boolean {
		const amountNano = utils.toNano(amount).toString()
		const timeMatched = transaction.utime * 1000 >= timestamp
		const addressMatched = isInput
			? transaction.in_msg.destination === address
			: transaction.out_msgs.length > 0 && transaction.out_msgs[0].source === address
		const amountMatched = isInput
			? transaction.in_msg.value === amountNano
			: transaction.out_msgs.length > 0 && transaction.out_msgs[0].value === amountNano
		return timeMatched && addressMatched && amountMatched
	}

	private bytesToHex(bytes: Uint8Array): string {
		return Buffer.from(bytes).toString("hex")
	}

	private hexToBytes(hex: string): Uint8Array {
		return Uint8Array.from(Buffer.from(hex, "hex"))
	}
}
