import { Inject, Injectable } from "@nestjs/common"
import BigNumber from "bignumber.js"
import { HttpProvider } from "tonweb/dist/types/providers/http-provider"
import {
	Error,
	MasterchainInfo,
	Message,
	Transaction as TonTransaction,
	WalletInfo,
} from "toncenter-rpc"
import tonweb from "tonweb"
import { AddressType } from "tonweb/dist/types/utils/address"
import { TON_CONNECTION } from "./constants"
import { Block } from "./interfaces/block.interface"
import { TonModuleOptions } from "./interfaces/ton-module-options.interface"
import { Transaction } from "./interfaces/transaction.interface"
import { WalletData } from "./interfaces/wallet-data.interface"

@Injectable()
export class TonBlockchainProvider {
	private readonly httpProvider: HttpProvider

	constructor(@Inject(TON_CONNECTION) options: TonModuleOptions) {
		const host = `https://${
			options.blockchainId === "testnet" ? "testnet." : ""
		}toncenter.com/api/v2/jsonRPC`
		this.httpProvider = new tonweb.HttpProvider(host, { apiKey: options.apiKey })
	}

	normalizeAddress(addressAny: AddressType): string {
		return new tonweb.Address(addressAny).toString(true, true, true)
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

	async getWalletData(addressAny: AddressType): Promise<WalletData> {
		const address = new tonweb.Address(addressAny)
		const response: WalletInfo | Error = await this.httpProvider.getWalletInfo(
			this.normalizeAddress(address),
		)
		if ("@type" in response) {
			throw new Error(`Code: ${response.code}. Message: ${response.message}`)
		}

		return {
			isWallet: response.wallet,
			address,
			balance: new BigNumber(tonweb.utils.fromNano(response.balance)),
			accountState: response.account_state,
			walletType: response.wallet_type,
			seqno: response.seqno,
		}
	}

	async getBalance(addressAny: AddressType): Promise<BigNumber> {
		const address = new tonweb.Address(addressAny)
		const response: string | Error = await this.httpProvider.getBalance(
			this.normalizeAddress(address),
		)
		if (typeof response !== "string") {
			throw new Error(`Code: ${response.code}. Message: ${response.message}`)
		}

		return new BigNumber(tonweb.utils.fromNano(response))
	}

	async findTransaction(
		addressAny: AddressType,
		timestamp: number,
		checkInput: boolean,
	): Promise<Transaction> {
		const address = this.normalizeAddress(addressAny)
		const response: TonTransaction[] | Error = await this.httpProvider.getTransactions(
			address,
			1,
		)
		if (!Array.isArray(response)) {
			throw new Error(`Code: ${response.code}. Message: ${response.message}`)
		}

		for (const transaction of response) {
			const message = this.findTransactionMessage(transaction, address, timestamp, checkInput)
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

	private findTransactionMessage(
		transaction: TonTransaction,
		addressAny: AddressType,
		timestamp: number,
		checkInput: boolean,
	): Message | undefined {
		const inputMessage = transaction.in_msg
		const outputMessages = transaction.out_msgs

		const address = this.normalizeAddress(addressAny)
		const addressMatched = checkInput
			? inputMessage.destination === address
			: outputMessages.length > 0 && outputMessages[0].source === address

		// const amountNano = tonweb.utils.toNano(amount).toString()
		// const amountMatched = checkInput
		// 	? inputMessage.value === amountNano
		// 	: outputMessages.length > 0 && outputMessages[0].value === amountNano

		const timeMatched = transaction.utime * 1000 >= timestamp

		if (addressMatched && timeMatched) {
			return checkInput ? inputMessage : outputMessages[0]
		}
		return
	}
}
