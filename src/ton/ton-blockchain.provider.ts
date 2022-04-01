import { Inject, Injectable } from "@nestjs/common"
import BigNumber from "bignumber.js"
import { HttpProvider } from "tonweb/dist/types/providers/http-provider"
import {
	Error,
	MasterchainInfo,
	Message,
	Transaction as TonTransaction,
	WalletInfo,
} from "ton-node"
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

	async getWalletInfo(address: AddressType): Promise<WalletData> {
		const tonAddress = new tonweb.Address(address)
		const response: WalletInfo | Error = await this.httpProvider.getWalletInfo(
			tonAddress.toString(),
		)
		if ("@type" in response) {
			throw new Error(`Code: ${response.code}. Message: ${response.message}`)
		}

		return {
			address,
			balance: new BigNumber(tonweb.utils.fromNano(response.balance)),
			accountState: response.account_state,
			walletType: response.wallet_type,
			seqno: response.seqno,
		}
	}

	async getBalance(address: AddressType): Promise<BigNumber> {
		const tonAddress = new tonweb.Address(address)
		const response: string | Error = await this.httpProvider.getBalance(tonAddress.toString())
		if (typeof response !== "string") {
			throw new Error(`Code: ${response.code}. Message: ${response.message}`)
		}

		return new BigNumber(tonweb.utils.fromNano(response))
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
}
