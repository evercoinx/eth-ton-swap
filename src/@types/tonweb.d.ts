declare module "tonweb" {
	import BN from "bn.js"
	import nacl from "tweetnacl"

	declare namespace utils {
		export const BN: BN

		export const nacl: nacl

		export class Address {
			wc: number
			hashPart: Uint8Array
			isUserFriendly: boolean
			isUrlSafe: boolean
			isBounceable: boolean
			isTestonly: boolean

			public constructor(anyForm: string | Address)

			public toString(
				isUserFriendly = false,
				isUrlSafe = false,
				isBounceable = false,
				isTestonly = false,
			): string

			public static isValid(anyForm: string | Address): boolean
		}

		export function sha256(bytes: Uint8Array): Promise<ArrayBuffer>

		export function fromNano(amount: number | BN | string): string

		export function toNano(amount: number | BN | string): BN

		export function bytesToHex(buffer: Uint8Array): string

		export function hexToBytes(s: string): Uint8Array

		export function stringToBytes(str: string, size = 1): Uint8Array

		export function crc32c(bytes: Uint8Array): Uint8Array

		export function crc16(data: ArrayLike<number>): Uint8Array

		export function concatBytes(a: Uint8Array, b: Uint8Array): Uint8Array

		export function compareBytes(a: Uint8Array, b: Uint8Array): boolean

		export function bytesToBase64(bytes: Uint8Array): string

		export function base64toString(base64: string): string

		export function stringToBase64(s: string): string

		export function base64ToBytes(base64: string): Uint8Array

		export function readNBytesUIntFromArray(n: number, ui8array: Uint8Array): number
	}

	declare namespace boc {
		class BitString {
			public constructor(length: number)

			public getFreeBits(): number

			public getUsedBits(): number

			public getUsedBytes(): number

			public get(n: number): boolean

			public on(n: number): void

			public off(n: number): void

			public toggle(n: number): void

			public forEach(callback: (boolean) => void): void

			public writeBit(b: boolean | number): void

			public writeBitArray(ba: Array<boolean | number>): void

			public writeUint(number: number | BN, bitLength: number): void

			public writeInt(number: number | BN, bitLength: number): void

			public writeUint8(ui8: number): void

			public writeBytes(ui8: Uint8Array): void

			public writeString(s: string): void

			public writeGrams(amount: number | BN): void

			public writeAddress(address?: utils.Address | null): void

			public writeBitString(anotherBitString: BitString): void

			public clone(): BitString

			public toString(): string

			public getTopUppedArray(): Uint8Array

			public toHex(): string

			public setTopUppedArray(array: Uint8Array, fullfilledBytes = true): void
		}

		export class Cell {
			public bits: BitString

			public constructor()

			public static fromBoc(serializedBoc: string | Uint8Array): Cell[]

			public static oneFromBoc(serializedBoc: string | Uint8Array): Cell

			public writeCell(anotherCell: Cell): void

			public getMaxLevel(): number

			public isExplicitlyStoredHashes(): number

			public getMaxDepth(): number

			public getMaxDepthAsArray(): Uint8Array

			public getRefsDescriptor(): Uint8Array

			public getBitsDescriptor(): Uint8Array

			public getDataWithDescriptors(): Uint8Array

			public getRepr(): Promise<Uint8Array>

			public hash(): Promise<Uint8Array>

			public print(indent: string): string

			public toBoc(
				hasIdx = true,
				hashCrc32 = true,
				hasCacheBits = false,
				flags = 0,
			): Promise<Uint8Array>

			public serializeForBoc(cellsIndex: any, refSize: null): Promise<Uint8Array>
		}
	}

	declare namespace providers {
		export interface Error {
			"@type": "error"
			code: number
			message: string
			"@extra": string
		}

		interface Block {
			"@type": "ton.blockIdExt"
			workchain: number
			shard: string
			seqno: number
			root_hash: string
			file_hash: string
		}

		interface TransactionId {
			"@type": "internal.transactionId"
			hash: string
			lt: string
		}

		interface AccountTransactionId extends TransactionId {
			"@type": "blocks.shortTxId"
			mode: number
			account: string
		}

		interface ExtendedAddressInfo {
			"@type": "fullAccountState"
			address: {
				"@type": "accountAddress"
				account_address: string
			}
			balance: string
			last_transaction_id: TransactionId
			block_id: Block
			sync_utime: number
			account_state: {
				"@type": "raw.accountState"
				code: string
				data: string
				frozen_hash: string
			}
			revision: number
			"@extra": string
		}

		type AccountState = "uninitialized" | "active" | "frozen"

		interface AddressInfo {
			"@type": "raw.fullAccountState"
			balance: string
			code: string
			data: string
			last_transaction_id: TransactionId
			block_id: Block
			frozen_hash: string
			sync_utime: number
			state: AccountState
			"@extra": string
		}

		interface WalletInfo {
			wallet: boolean
			balance: string
			account_state: AccountState
			last_transaction_id: TransactionId
		}

		export interface Message {
			"@type": "raw.message"
			source: string
			destination: string
			value: string
			fwd_fee: string
			ihr_fee: string
			created_lt: string
			body_hash: string
			msg_data: {
				"@type": "msg.dataText"
				text: string
			}
			message: string
		}

		export interface Transaction {
			"@type": "raw.transaction"
			utime: number
			data: string
			transaction_id: TransactionId
			fee: string
			storage_fee: string
			other_fee: string
			in_msg: Message
			out_msgs: Message[]
		}

		interface MasterchainInfo {
			"@type": "blocks.masterchainInfo"
			last: Block
			state_root_hash: string
			init: Block
			"@extra": string
		}

		interface BlockShards {
			"@type": "blocks.shards"
			shards: Block[]
			"@extra": string
		}

		interface BlockHeader {
			"@type": "blocks.header"
			id: Block
			global_id: number
			version: number
			after_merge: boolean
			after_split: boolean
			before_split: boolean
			want_merge: boolean
			want_split: boolean
			validator_list_hash_short: number
			catchain_seqno: number
			min_ref_mc_seqno: number
			is_key_block: boolean
			prev_key_block_seqno: number
			start_lt: string
			end_lt: string
			prev_blocks: Block[]
			"@extra": string
		}

		interface BlockTransactions {
			"@type": "blocks.transactions"
			id: Block
			req_count: number
			incomplete: boolean
			transactions: AccountTransactionId[]
			"@extra": string
		}

		export interface Send {
			"@type": "ok"
			"@extra": string
		}

		export interface SourceFees {
			"@type": "fees"
			gas_fee: number
			in_fwd_fee: number
			fwd_fee: number
			storage_fee: number
		}

		export interface Fees {
			"@type": "query.fees"
			source_fees: SourceFees
			destination_fees: []
			"@extra": string
		}

		export type MethodId = string | number

		type CallMethodParams = [string, any][]

		export class HttpProvider {
			public constructor(host: string)

			public send(method: string, params: any[]): Promise<any>

			public getAddressInfo(address: string): Promise<AddressInfo | Error>

			public getExtendedAddressInfo(address: string): Promise<ExtendedAddressInfo | Error>

			public getWalletInfo(address: string): Promise<WalletInfo | Error>

			public getTransactions(
				address: string,
				limit? = 20,
				lt?: number,
				txHash?: string,
				toLt?: number,
			): Promise<Transaction[] | Error>

			public async getBalance(address: string): Promise<string>

			public sendBoc(bytes: Uint8Array): Promise<Send | Error>

			public call(
				address: string,
				method: MethodId,
				params: CallMethodParams = [],
			): Promise<any>

			public call2(
				address: string,
				method: MethodId,
				params: CallMethodParams = [],
			): Promise<any>

			public getMasterchainInfo(): Promise<MasterchainInfo | Error>

			public getBlockShards(masterchainBlockNumber: number): Promise<BlockShards | Error>

			public getBlockTransactions(
				workchain: number,
				shardId: string,
				shardBlockNumber: number,
			): Promise<BlockTransactions | Error>

			public getMasterchainBlockTransactions(
				masterchainBlockNumber: number,
			): Promise<BlockTransactions | Error>

			public getBlockHeader(
				workchain: number,
				shardId: string,
				shardBlockNumber: number,
			): Promise<BlockHeader | Error>

			public getMasterchainBlockHeader(
				masterchainBlockNumber: number,
			): Promise<BlockHeader | Error>
		}
	}

	declare namespace blockSubscription {
		interface ShardBlock {
			workchain: number
			shardId: string
			shardBlockNumber: number
		}

		export class InMemoryBlockStorage {
			public constructor(public logFunction: (text: string) => void)

			public insertBlocks(
				mcBlockNumber: number,
				shardBlockNumbers: ShardBlock[],
			): Promise<void>

			public setBlockProcessed(
				workchain: Pick<ShardBlock, "number">,
				shardId: Pick<ShardBlock, "shardId">,
				shardBlockNumber: Pick<ShardBlock, "shardBlockNumber">,
				prevShardBlocks: ShardBlock[],
			): Promise<void>

			public getLastMasterchainBlockNumber(): Promise<number | undefined>

			public getUnprocessedShardBlock(): Promise<ShardBlock | undefined>
		}

		interface Options {
			startMcBlockNumber?: number
			mcInterval? = 1000 // ms
			shardsInterval? = 1000 // ms
		}

		type BlockHandlerParams = {
			blockHeader: providers.BlockHeader
		}

		export class BlockSubscription {
			public startMcBlockNumber: Pick<Options, "startMcBlockNumber">
			public mcInterval: Pick<Options, "mcInterval">
			public shardsInterval: Pick<Options, "shardsInterval">

			public constructor(
				public provider: providers.HttpProvider,
				public storage: InMemoryBlockStorage,
				public onBlock: (params: BlockHandlerParams) => Promise<void>,
				public options: Options,
			)

			public start(): Promise<void>
			public stop(): Promise<void>
		}
	}

	declare namespace contract {
		interface StateInit {
			stateInit: boc.Cell
			code: boc.Cell
			data: boc.Cell
			address: utils.Address
		}

		interface Message {
			message: boc.Cell
			body: boc.Cell
			address: utils.Address
		}

		export interface InitExternalMessage extends Message {
			code: boc.Cell
			data: boc.Cell
		}

		export interface ExternalMessage extends Message {
			code?: boc.Cell
			data?: boc.Cell
		}

		export interface MethodCallerRequest<T> {
			call: () => Promise<T | null | undefined>
		}

		export type MethodCaller<T> = () => MethodCallerRequest<T>

		export interface MethodSenderRequest {
			send: () => Promise<providers.Send | providers.Error>
			getQuery: () => Promise<boc.Cell>
			estimateFee: () => Promise<providers.Fees | providers.Error>
		}

		export type MethodSender = (...args: any[]) => MethodSenderRequest

		export interface Methods {
			[methodName: string]: MethodCaller<any> | MethodSender
		}

		export interface Options {
			code?: boc.Cell
			publicKey?: Uint8Array
			wc?: number
			address?: utils.Address | string
		}

		export class Contract {
			public address: utils.Address
			public methods: Methods

			public constructor(public provider: providers.HttpProvider, public options: Options)

			public getAddress(): Promise<utils.Address>

			private createCodeCell(): boc.Cell

			protected createDataCell(): boc.Cell

			protected createStateInit(): Promise<StateInit>

			public static createStateInit(
				code: boc.Cell,
				data: boc.Cell,
				library?: boc.Cell,
				splitDepth?: boc.Cell,
				tickTock?: boc.Cell,
			): Promise<boc.Cell>

			public static createExternalMessageHeader(
				dest: utils.Address | string,
				src?: utils.Address | string,
				importFee?: number | BN = 0,
			): boc.Cell

			public static createInternalMessageHeader(
				dest: utils.Address | string,
				gramValue?: number | BN = 0,
				ihrDisabled? = true,
				bounce?: boolean,
				bounced? = false,
				src?: utils.Address | string,
				currencyCollection?: undefined,
				ihrFees?: number | BN = 0,
				fwdFees?: number | BN = 0,
				createdLt?: number | BN = 0,
				createdAt?: number | BN = 0,
			): boc.Cell

			public static createCommonMsgInfo(
				header: boc.Cell,
				stateInit?: boc.Cell,
				body?: boc.Cell,
			): boc.Cell

			public static createMethod(
				provider: providers.HttpProvider,
				queryPromise: Promise<InitExternalMessage | ExternalMessage>,
			): MethodSenderRequest
		}

		class WalletContract extends Contract {
			public deploy(secretKey: Uint8Array): Promise<MethodSenderRequest>
		}

		export class Wallets {
			public all: {
				[version: string]: typeof WalletContract
			}

			public list: typeof WalletContract[]
			public defaultVersion: string
			public default: typeof WalletContract

			public constructor(public provider: providers.HttpProvider)

			public create(options: contract.Options): WalletContract
		}
	}

	export const Address = utils.Address

	export const HttpProvider = providers.HttpProvider

	export const Contract = contract.Contract

	export const Wallets = contract.Wallets

	export const BlockSubscription = blockSubscription.BlockSubscription

	export const InMemoryBlockStorage = blockSubscription.InMemoryBlockStorage

	export default class TonWeb {
		public static version: string
		public static utils: utils
		public static Address: typeof utils.Address
		public static boc: boc
		public static HttpProvider: typeof providers.HttpProvider
		public static Contract: typeof contract.Contract
		public static Wallets: typeof contract.Wallets
		public static BlockSubscription: blockSubscription.BlockSubscription
		public static InMemoryBlockStorage: blockSubscription.InMemoryBlockStorage

		public version: Pick<TonWeb, "version">
		public utils: utils
		public Address: Pick<TonWeb, "Address">
		public boc: boc
		public Contract: Pick<TonWeb, "Contract">
		public wallet: contract.Wallets
		public BlockSubscription: Pick<TonWeb, "BlockSubscription">
		public InMemoryBlockStorage: Pick<TonWeb, "InMemoryBlockStorage">

		public constructor(public provider: providers.HttpProvider)

		public getTransactions(
			address: string,
			limit? = 20,
			lt?: number,
			txHash?: string,
			toLt?: number,
		): Promise<providers.Transaction[] | providers.Error>

		public async getBalance(address: string): Promise<string>

		public sendBoc(bytes: Uint8Array): Promise<providers.Send | providers.Error>

		public call(
			address: string,
			method: providers.MethodId,
			params: providers.CallMethodParams = [],
		): Promise<any>
	}
}
