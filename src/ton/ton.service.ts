import { Inject, Injectable } from "@nestjs/common"
import BigNumber from "bignumber.js"
import { WalletContract } from "tonweb/dist/types/contract/wallet/wallet-contract"
import { HttpProvider } from "tonweb/dist/types/providers/http-provider"
import { Error, Message, Send, Transaction as TonTransaction } from "ton-node"
import tonweb from "tonweb"
import nacl from "tweetnacl"
import { TON_CONNECTION } from "./constants"
import { Block } from "./interfaces/block.interface"
import { TonModuleOptions } from "./interfaces/ton-module-options.interface"
import { WalletSigner } from "./interfaces/wallet-signer.interface"
import { Transaction } from "./interfaces/transaction.interface"

enum SendMode {
	NoAction = 0,
	SenderPaysForwardFees = 1,
	IgnoreErrors = 2,
	FreezeAccount = 32,
	ReturnInboundMessageValue = 64,
	ReturnAccountRemainingBalance = 128,
}

@Injectable()
export class TonService {
	private readonly httpProvider: HttpProvider
	private readonly walletClass: typeof WalletContract
	private readonly workchain: number

	constructor(@Inject(TON_CONNECTION) options: TonModuleOptions) {
		const host = `https://${
			options.blockchainId === "testnet" ? "testnet." : ""
		}toncenter.com/api/v2/jsonRPC`
		this.httpProvider = new tonweb.HttpProvider(host, { apiKey: options.apiKey })

		const wallets = new tonweb.Wallets(this.httpProvider)
		this.walletClass = wallets.all[options.walletVersion]
	}

	createRandomWallet(): WalletSigner {
		const keyPair = nacl.sign.keyPair()
		const wallet = new this.walletClass(this.httpProvider, {
			publicKey: keyPair.publicKey,
			wc: this.workchain,
		})
		return {
			wallet,
			secretKey: this.bytesToHex(keyPair.secretKey),
		}
	}

	async transferToncoin(
		secretKey: string,
		recipientAddress: string,
		amount: string,
		memo: string,
	): Promise<void> {
		const wallet = this.createWallet(secretKey)

		const seqno = await wallet.methods.seqno().call()
		if (seqno == null) {
			throw new Error(`Sequence number not defined`)
		}

		const amountNano = tonweb.utils.toNano(amount)
		const request = wallet.methods.transfer({
			secretKey: this.hexToBytes(secretKey),
			toAddress: recipientAddress,
			amount: amountNano,
			seqno,
			payload: memo,
			sendMode: SendMode.SenderPaysForwardFees | SendMode.IgnoreErrors,
		})

		const response: Send | Error = await request.send()
		if (response["@type"] === "error") {
			throw new Error(`Code: ${response.code}, message: ${response.message}`)
		}
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

	async findTransaction(
		address: string,
		amount: string,
		timestamp: number,
		isInput: boolean,
	): Promise<Transaction> {
		const response: TonTransaction[] | Error = await this.httpProvider.getTransactions(
			address,
			1,
		)
		if (!Array.isArray(response)) {
			throw new Error(`Code: ${response.code}, message: ${response.message}`)
		}

		for (const transaction of response) {
			const message = this.findTransactionMessage(
				transaction,
				address,
				amount,
				timestamp,
				isInput,
			)
			if (message) {
				return {
					id: `${transaction.transaction_id.lt}:${transaction.transaction_id.hash}`,
					sourceAddress: message.source,
					destinationAddress: message.destination,
				}
			}
		}

		throw new Error("Transaction not found")
	}

	async getBalance(address: string): Promise<BigNumber> {
		const response: string | Error = await this.httpProvider.getBalance(address)
		if (typeof response !== "string") {
			throw new Error(`Code: ${response.code}, message: ${response.message}`)
		}

		return new BigNumber(tonweb.utils.fromNano(response))
	}

	private createWallet(secretKey: string): WalletContract {
		const keyPair = nacl.sign.keyPair.fromSecretKey(this.hexToBytes(secretKey))
		return new this.walletClass(this.httpProvider, {
			publicKey: keyPair.publicKey,
			wc: this.workchain,
		})
	}

	private findTransactionMessage(
		transaction: TonTransaction,
		address: string,
		amount: string,
		timestamp: number,
		isInput: boolean,
	): Message | undefined {
		const inputMessage = transaction.in_msg
		const outputMessages = transaction.out_msgs

		const addressMatched = isInput
			? inputMessage.destination === address
			: outputMessages.length > 0 && outputMessages[0].source === address

		const amountNano = tonweb.utils.toNano(amount).toString()
		const amountMatched = isInput
			? inputMessage.value === amountNano
			: outputMessages.length > 0 && outputMessages[0].value === amountNano

		const timeMatched = transaction.utime * 1000 >= timestamp

		if (addressMatched && amountMatched && timeMatched) {
			return isInput ? inputMessage : outputMessages[0]
		}
		return
	}

	private bytesToHex(bytes: Uint8Array): string {
		return Buffer.from(bytes).toString("hex")
	}

	private hexToBytes(hex: string): Uint8Array {
		return Uint8Array.from(Buffer.from(hex, "hex"))
	}
}
