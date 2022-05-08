import { Inject, Injectable } from "@nestjs/common"
import BigNumber from "bignumber.js"
import { HttpProvider } from "tonweb/dist/types/providers/http-provider"
import { Error, MasterchainInfo, Transaction, WalletInfo } from "toncenter-rpc"
import tonweb from "tonweb"
import { AddressType } from "tonweb/dist/types/utils/address"
import { Cell, Slice } from "ton"
import { TON_CONNECTION_TOKEN } from "../constants"
import { JettonOperation } from "../enums/jetton-operation.enum"
import { Block } from "../interfaces/block.interface"
import { TonModuleOptions } from "../interfaces/ton-module-options.interface"
import { TransactionData } from "../interfaces/transaction-data.interface"
import { WalletData } from "../interfaces/wallet-data.interface"

@Injectable()
export class TonBlockchainService {
	private readonly httpProvider: HttpProvider

	constructor(@Inject(TON_CONNECTION_TOKEN) options: TonModuleOptions) {
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
		createdAt: Date,
		jettonOperation?: JettonOperation,
	): Promise<TransactionData | undefined> {
		const response: Transaction[] | Error = await this.httpProvider.getTransactions(
			this.normalizeAddress(addressAny),
			1,
		)
		if (!Array.isArray(response)) {
			throw new Error(`Code: ${response.code}. Message: ${response.message}`)
		}

		for (const transaction of response) {
			const parsedTransaction = jettonOperation
				? this.parseJettonTransaction(transaction, jettonOperation)
				: this.parseToncoinTransaction(transaction)
			if (parsedTransaction && parsedTransaction.time >= createdAt) {
				return parsedTransaction
			}
		}
	}

	parseToncoinTransaction(transaction: Transaction): TransactionData | undefined {
		if (!transaction.in_msg?.msg_data) {
			return
		}

		const input = transaction.in_msg
		return {
			id: this.generateTransactionId(transaction),
			sourceAddress: input.source ? new tonweb.Address(input.source) : undefined,
			destinationAddress: input.destination
				? new tonweb.Address(input.destination)
				: undefined,
			amount: new BigNumber(tonweb.utils.fromNano(input.value)),
			time: new Date(transaction.utime * 1000),
			queryId: "0",
			payload: "",
		}
	}

	parseJettonTransaction(
		transaction: Transaction,
		jettonOperation: JettonOperation,
	): TransactionData | undefined {
		if (!transaction.in_msg?.msg_data.body) {
			return
		}

		const [bodyCell] = Cell.fromBoc(Buffer.from(transaction.in_msg.msg_data.body, "base64"))
		const bodySlice = bodyCell.beginParse()
		const operation = bodySlice.readUint(32).toNumber()
		if (operation !== jettonOperation) {
			return
		}

		switch (operation) {
			case JettonOperation.INTERNAL_TRANSFER:
				return this.parseJettonInternalTransferTransaction(bodySlice, transaction)
			case JettonOperation.TRANSFER:
				return this.parseJettonTransferTransaction(bodySlice, transaction)
			case JettonOperation.BURN:
				return this.parseJettonBurnTransaction(bodySlice, transaction)
		}
	}

	/**
		transfer query_id:uint64 amount:(VarUInteger 16) destination:MsgAddress
			response_destination:MsgAddress custom_payload:(Maybe ^Cell)
			forward_ton_amount:(VarUInteger 16) forward_payload:(Either Cell ^Cell)
			= InternalMsgBody;
	*/
	private parseJettonTransferTransaction(
		bodySlice: Slice,
		transaction: Transaction,
	): TransactionData {
		const queryId = bodySlice.readUint(64)
		const amount = bodySlice.readCoins()
		const destination = bodySlice.readAddress()

		bodySlice.readAddress() // response destination
		bodySlice.skip(1) // custom payload
		bodySlice.readCoins() // forward ton amount

		const payload =
			!bodySlice.readBit() && bodySlice.remaining && bodySlice.remaining % 8 === 0
				? bodySlice.readRemainingBytes().toString()
				: ""

		return {
			id: this.generateTransactionId(transaction),
			sourceAddress: undefined,
			destinationAddress: destination
				? new tonweb.Address(destination.toFriendly())
				: undefined,
			amount: new BigNumber(tonweb.utils.fromNano(amount.toString(10))),
			time: new Date(transaction.utime * 1000),
			queryId: queryId.toString(10),
			payload,
		}
	}

	/**
		internal_transfer query_id:uint64 amount:(VarUInteger 16) from:MsgAddress
			response_address:MsgAddress
			forward_ton_amount:(VarUInteger 16)
			forward_payload:(Either Cell ^Cell)
			= InternalMsgBody;
	*/
	private parseJettonInternalTransferTransaction(
		bodySlice: Slice,
		transaction: Transaction,
	): TransactionData {
		const queryId = bodySlice.readUint(64)
		const amount = bodySlice.readCoins()
		const source = bodySlice.readAddress()

		bodySlice.readAddress() // response address
		bodySlice.readCoins() // forward ton amount

		const payload =
			!bodySlice.readBit() && bodySlice.remaining && bodySlice.remaining % 8 === 0
				? bodySlice.readRemainingBytes().toString()
				: ""

		return {
			id: this.generateTransactionId(transaction),
			sourceAddress: source ? new tonweb.Address(source.toFriendly()) : undefined,
			destinationAddress: undefined,
			amount: new BigNumber(tonweb.utils.fromNano(amount.toString(10))),
			time: new Date(transaction.utime * 1000),
			queryId: queryId.toString(10),
			payload,
		}
	}

	/**
		transfer query_id:uint64 amount:(VarUInteger 16) destination:MsgAddress
			response_destination:MsgAddress
			= InternalMsgBody;
	*/
	private parseJettonBurnTransaction(
		bodySlice: Slice,
		transaction: Transaction,
	): TransactionData {
		const queryId = bodySlice.readUint(64)
		const amount = bodySlice.readCoins()
		const destination = bodySlice.readAddress()

		return {
			id: this.generateTransactionId(transaction),
			sourceAddress: undefined,
			destinationAddress: destination
				? new tonweb.Address(destination.toFriendly())
				: undefined,
			amount: new BigNumber(tonweb.utils.fromNano(amount.toString(10))),
			time: new Date(transaction.utime * 1000),
			queryId: queryId.toString(10),
			payload: "",
		}
	}

	private generateTransactionId(transaction: Transaction): string {
		return `${transaction.transaction_id.lt}:${transaction.transaction_id.hash}`
	}
}
