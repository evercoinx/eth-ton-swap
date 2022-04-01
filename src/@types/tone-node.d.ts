declare module "ton-node" {
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
		lt: string
		hash: string
	}

	interface AccountTransactionId {
		"@type": "blocks.shortTxId"
		lt: string
		hash: string
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
		wallet_type?: string
		seqno?: number
		wallet_id?: number
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

	export interface Fees {
		"@type": "query.fees"
		source_fees: SourceFees
		destination_fees: []
		"@extra": string
	}

	export interface SourceFees {
		"@type": "fees"
		in_fwd_fee: number
		storage_fee: number
		gas_fee: number
		fwd_fee: number
	}
}
