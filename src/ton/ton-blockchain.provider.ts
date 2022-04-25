import { Inject, Injectable } from "@nestjs/common"
import BigNumber from "bignumber.js"
import { HttpProvider } from "tonweb/dist/types/providers/http-provider"
import { Error, MasterchainInfo, Transaction, WalletInfo } from "toncenter-rpc"
import tonweb from "tonweb"
import { AddressType } from "tonweb/dist/types/utils/address"
import { Cell, Slice } from "ton"
import { TON_CONNECTION } from "./constants"
import { Block } from "./interfaces/block.interface"
import { JettonTransaction } from "./interfaces/jetton-transaction.interface"
import { TonModuleOptions } from "./interfaces/ton-module-options.interface"
import { TransactionData } from "./interfaces/transaction-data.interface"
import { WalletData } from "./interfaces/wallet-data.interface"

export enum JettonTransactionType {
	INCOMING = "incoming",
	OUTGOING = "outgoing",
}

enum JettonOperation {
	TRANSFER = 0xf8a7ea5,
	TRANSFER_NOTIFICATION = 0x7362d09c,
	INTERNAL_TRANSFER = 0x178d4519,
	EXCESSES = 0xd53276db,
	BURN = 0x595f07bc,
	BURN_NOTIFICATION = 0x7bdd97de,
}

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

	async matchTransaction(
		addressAny: AddressType,
		createdAt: number,
		type: JettonTransactionType,
	): Promise<TransactionData> {
		const address = this.normalizeAddress(addressAny)
		const response: Transaction[] | Error = await this.httpProvider.getTransactions(address, 1)
		if (!Array.isArray(response)) {
			throw new Error(`Code: ${response.code}. Message: ${response.message}`)
		}

		for (const transaction of response) {
			const parsedTransaction = this.parseTransaction(transaction, type)
			if (!parsedTransaction || parsedTransaction.time * 1000 < createdAt) {
				continue
			}

			return {
				id: `${transaction.transaction_id.lt}:${transaction.transaction_id.hash}`,
				sourceAddress:
					parsedTransaction.sourceAddress &&
					new tonweb.Address(parsedTransaction.sourceAddress),
				destinationAddress:
					parsedTransaction.destinationAddress &&
					new tonweb.Address(parsedTransaction.destinationAddress),
				amount: new BigNumber(tonweb.utils.fromNano(parsedTransaction.amount)),
			}
		}

		throw new Error("Transaction not found")
	}

	parseTransaction(
		transaction: Transaction,
		type: JettonTransactionType,
	): JettonTransaction | undefined {
		if (!transaction.in_msg.msg_data.body) {
			return // Not a jetton transaction
		}

		const [bodyCell] = Cell.fromBoc(Buffer.from(transaction.in_msg.msg_data.body, "base64"))
		const bodySlice = bodyCell.beginParse()
		const operation = bodySlice.readUint(32).toNumber()

		if (
			type === JettonTransactionType.INCOMING &&
			operation === JettonOperation.INTERNAL_TRANSFER
		) {
			return this.parseInternalTransferTransaction(bodySlice, transaction)
		}
		if (type === JettonTransactionType.OUTGOING && operation === JettonOperation.TRANSFER) {
			return this.parseTransferTransaction(bodySlice, transaction)
		}
		return // An unknown operation
	}

	/**
		transfer query_id:uint64 amount:(VarUInteger 16) destination:MsgAddress
			response_destination:MsgAddress custom_payload:(Maybe ^Cell)
			forward_ton_amount:(VarUInteger 16) forward_payload:(Either Cell ^Cell)
			= InternalMsgBody;
	*/
	private parseTransferTransaction(
		bodySlice: Slice,
		transaction: Transaction,
	): JettonTransaction {
		const queryId = bodySlice.readUint(64)
		const amount = bodySlice.readCoins()
		const destination = bodySlice.readAddress()

		bodySlice.readAddress() // response destination
		bodySlice.skip(1) // custom payload
		bodySlice.readCoins() // forward ton amount

		const comment =
			!bodySlice.readBit() && bodySlice.remaining && bodySlice.remaining % 8 === 0
				? bodySlice.readRemainingBytes().toString()
				: ""

		return {
			sourceAddress: undefined,
			destinationAddress: destination?.toFriendly() ?? undefined,
			amount: amount.toString(10),
			time: transaction.utime,
			queryId: queryId.toString(10),
			comment,
		}
	}

	/**
		internal_transfer  query_id:uint64 amount:(VarUInteger 16) from:MsgAddress
			response_address:MsgAddress
			forward_ton_amount:(VarUInteger 16)
			forward_payload:(Either Cell ^Cell)
			= InternalMsgBody;
	*/
	private parseInternalTransferTransaction(
		bodySlice: Slice,
		transaction: Transaction,
	): JettonTransaction {
		const queryId = bodySlice.readUint(64)
		const amount = bodySlice.readCoins()
		const source = bodySlice.readAddress()

		bodySlice.readAddress() // response_address
		bodySlice.readCoins() // forward_ton_amount

		const comment =
			!bodySlice.readBit() && bodySlice.remaining && bodySlice.remaining % 8 === 0
				? bodySlice.readRemainingBytes().toString()
				: ""

		return {
			sourceAddress: source?.toFriendly() ?? undefined,
			destinationAddress: undefined,
			amount: amount.toString(10),
			time: transaction.utime,
			queryId: queryId.toString(10),
			comment,
		}
	}
}
