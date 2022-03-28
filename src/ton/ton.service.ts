import { Inject, Injectable } from "@nestjs/common"
import BigNumber from "bignumber.js"
import { WalletContract } from "tonweb/dist/types/contract/wallet/wallet-contract"
import { HttpProvider } from "tonweb/dist/types/providers/http-provider"
import { AddressType } from "tonweb/dist/types/utils/address"
import { Error, MasterchainInfo, Message, Send, Transaction as TonTransaction } from "ton-node"
import tonweb from "tonweb"
import { Cell } from "tonweb/dist/types/boc/cell"
import nacl from "tweetnacl"
import { TON_CONNECTION } from "./constants"
import { Block } from "./interfaces/block.interface"
import { MinterInfo } from "./interfaces/minter-info.interface"
import { TonModuleOptions } from "./interfaces/ton-module-options.interface"
import { Transaction } from "./interfaces/transaction.interface"
import { WalletSigner } from "./interfaces/wallet-signer.interface"

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

	createWallet(secretKey: string): WalletSigner {
		const keyPair = nacl.sign.keyPair.fromSecretKey(this.hexToBytes(secretKey))
		const wallet = new this.walletClass(this.httpProvider, {
			publicKey: keyPair.publicKey,
			wc: this.workchain,
		})
		return {
			wallet,
			secretKey,
		}
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

	async deployMinterContract(adminWalletSigner: WalletSigner): Promise<MinterInfo> {
		const adminAddress = await adminWalletSigner.wallet.getAddress()

		const { JettonMinter, JettonWallet } = tonweb.token.jetton
		const minter = new JettonMinter(this.httpProvider, {
			adminAddress,
			jettonContentUri: "https://usdj.test",
			jettonWalletCodeHex: JettonWallet.codeHex,
			wc: this.workchain as 0,
		})
		const minterAddress = await minter.getAddress()

		const stateInit = (await minter.createStateInit()).stateInit
		await this.transfer(adminWalletSigner, minterAddress, 0.1, undefined, stateInit)

		const data = await minter.getJettonData()
		return {
			totalSupply: data.totalSupply.toString(),
			minterAddress,
			adminAddress,
		}
	}

	async transfer(
		walletSinger: WalletSigner,
		recipientAddress: AddressType,
		amount: string | number,
		payload?: string,
		stateInit?: Cell,
	): Promise<void> {
		const seqno = await walletSinger.wallet.methods.seqno().call()
		if (seqno == null) {
			throw new Error(`Seqno not defined`)
		}

		const amountNano = tonweb.utils.toNano(amount)
		const request = walletSinger.wallet.methods.transfer({
			secretKey: this.hexToBytes(walletSinger.secretKey),
			toAddress: recipientAddress,
			amount: amountNano,
			seqno,
			payload,
			stateInit,
			sendMode: SendMode.SenderPaysForwardFees | SendMode.IgnoreErrors,
		})

		const response: Send | Error = await request.send()
		if (response["@type"] === "error") {
			throw new Error(`Code: ${response.code}. Message: ${response.message}`)
		}
	}

	normalizeAddress(address: AddressType): string {
		return new tonweb.Address(address).toString(true, true, true)
	}

	async getLatestBlock(): Promise<Block> {
		const response: MasterchainInfo | Error = await this.httpProvider.getMasterchainInfo()
		if (response["@type"] === "error") {
			throw new Error(`Code: ${response.code}. Message: ${response.message}`)
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
			throw new Error(`Code: ${response.code}. Message: ${response.message}`)
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
			throw new Error(`Code: ${response.code}. Message: ${response.message}`)
		}

		return new BigNumber(tonweb.utils.fromNano(response))
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
