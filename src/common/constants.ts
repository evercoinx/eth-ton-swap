export const SWAPS_EVENT_GROUP = "SWAPS_EVENT_GROUP"

export const QUEUE_HIGH_PRIORITY = 1
export const QUEUE_MEDIUM_PRIORITY = 2
export const QUEUE_LOW_PRIORITY = 3

export const ATTEMPT_COUNT_NORMAL = (20 * 60) / 4
export const ATTEMPT_COUNT_EXTENDED = 3 * ATTEMPT_COUNT_NORMAL
export const ATTEMPT_COUNT_ULTIMATE = 12 * ATTEMPT_COUNT_NORMAL

export const ERROR_NO_ERROR = "No error"
export const ERROR_SWAP_EXPIRED = "Swap expired"
export const ERROR_SWAP_NOT_RECACULATED_ZERO_AMOUNT = "Swap not recalculated: Zero amount"
export const ERROR_SWAP_NOT_RECACULATED_TOO_LOW = "Swap not recalculated: Amount too low"
export const ERROR_SWAP_NOT_RECACULATED_TOO_HIGH = "Swap not recalculated: Amount too high"
export const ERROR_SWAP_NOT_RECACULATED_ZERO_FEE = "Swap not recalculated: Zero fee"
export const ERROR_JETTON_MINTER_ADMIN_WALLET_NOT_FOUND = "Jetton minter admin wallet not found"

export const ERROR_SWAP_NOT_FOUND = "Swap not found"
export const ERROR_TOKEN_NOT_FOUND = "Token not found"
export const ERROR_INVALID_ADDRESS = "Invalid address"
export const ERROR_SWAP_AMOUNT_TOO_LOW = "Swap amount too low"
export const ERROR_SWAP_AMOUNT_TOO_HIGH = "Swap amount too high"
export const ERROR_TOO_MANY_REQUESTS = "Too many requests"
export const ERROR_SOURCE_WALLLET_NOT_AVAILABLE = "Source wallet not available"
export const ERROR_DESTINATION_WALLLET_NOT_AVAILABLE = "Destination wallet not available"
export const ERROR_COLLECTOR_WALLLET_NOT_AVAILABLE = "Collector wallet not available"
export const ERROR_BLOCKCHAIN_CONNECTION_LOST = "Blockchain connection lost"
export const ERROR_BLOCKCHAIN_NOT_SUPPORTED = "Blockchain not supported"
export const ERROR_SWAP_ALREADY_COMPLETED = "Swap already completed"
export const ERROR_SWAP_IN_PROGRESS = "Swap in progress"
export const ERROR_TOKEN_ALREADY_EXISTS = "Token already exists"
export const ERROR_WALLET_NOT_FOUND = "Wallet not found"
export const ERROR_WALLET_ALREADY_EXISTS = "Wallet already exists"
export const ERROR_INVALID_MNEMONIC = "Invalid mnemonic"
export const ERROR_SETTING_NOT_FOUND = "Setting not found"
export const ERROR_SETTING_ALREADY_EXISTS = "Setting already exists"
export const ERROR_UNACCEPTABLE_WALLET_TYPE = "Unacceptable wallet type"

export const ERROR_TO_STATUS_CODE: Record<string, number> = {
	[ERROR_NO_ERROR]: 0,
	[ERROR_SWAP_EXPIRED]: 1,
	[ERROR_SWAP_NOT_RECACULATED_ZERO_AMOUNT]: 2,
	[ERROR_SWAP_NOT_RECACULATED_TOO_LOW]: 3,
	[ERROR_SWAP_NOT_RECACULATED_TOO_HIGH]: 4,
	[ERROR_SWAP_NOT_RECACULATED_ZERO_FEE]: 5,
	[ERROR_JETTON_MINTER_ADMIN_WALLET_NOT_FOUND]: 6,

	[ERROR_SWAP_NOT_FOUND]: 1000,
	[ERROR_TOKEN_NOT_FOUND]: 1001,
	[ERROR_INVALID_ADDRESS]: 1002,
	[ERROR_SWAP_AMOUNT_TOO_LOW]: 1003,
	[ERROR_SWAP_AMOUNT_TOO_HIGH]: 1004,
	[ERROR_TOO_MANY_REQUESTS]: 1005,
	[ERROR_SOURCE_WALLLET_NOT_AVAILABLE]: 1006,
	[ERROR_DESTINATION_WALLLET_NOT_AVAILABLE]: 1007,
	[ERROR_COLLECTOR_WALLLET_NOT_AVAILABLE]: 1008,
	[ERROR_BLOCKCHAIN_CONNECTION_LOST]: 1009,
	[ERROR_BLOCKCHAIN_NOT_SUPPORTED]: 1010,
	[ERROR_SWAP_ALREADY_COMPLETED]: 1011,
	[ERROR_SWAP_IN_PROGRESS]: 1012,
	[ERROR_TOKEN_ALREADY_EXISTS]: 1013,
	[ERROR_WALLET_NOT_FOUND]: 1014,
	[ERROR_WALLET_ALREADY_EXISTS]: 1015,
	[ERROR_INVALID_MNEMONIC]: 1016,
	[ERROR_SETTING_NOT_FOUND]: 1017,
	[ERROR_SETTING_ALREADY_EXISTS]: 1018,
	[ERROR_UNACCEPTABLE_WALLET_TYPE]: 1019,
}

export function getStatusCode(errorMessage: string): number {
	return ERROR_TO_STATUS_CODE[errorMessage]
}
