export const ETH_SOURCE_SWAPS_QUEUE = "eth_source_swaps"
export const TON_SOURCE_SWAPS_QUEUE = "ton_source_swaps"
export const ETH_DESTINATION_SWAPS_QUEUE = "eth_destination_swaps"
export const TON_DESTINATION_SWAPS_QUEUE = "ton_destination_swaps"

export const CONFIRM_ETH_SWAP_JOB = "confirm_eth_swap"
export const CONFIRM_TON_SWAP_JOB = "confirm_ton_swap"
export const CONFIRM_ETH_BLOCK_JOB = "confirm_eth_block"
export const CONFIRM_TON_BLOCK_JOB = "confirm_ton_block"
export const TRANSFER_ETH_FEE_JOB = "transfer_eth_fee"
export const TRANSFER_TON_FEE_JOB = "transfer_ton_fee"
export const TRANSFER_ETH_SWAP_JOB = "transfer_eth_swap"
export const TRANSFER_TON_SWAP_JOB = "transfer_ton_swap"
export const SET_TON_TRANSACTION_ID = "set_ton_transaction_id"

export const SWAP_EXPIRATION_INTERVAL = 20 * 60 * 1000
export const MAX_PENDING_SWAP_COUNT_BY_IP = 5
export const TOTAL_BLOCK_CONFIRMATIONS = 5

export const ETH_BLOCK_TRACKING_INTERVAL = 14000 / 2
export const TON_BLOCK_TRACKING_INTERVAL = 4000

export const ETH_CACHE_TTL = (ETH_BLOCK_TRACKING_INTERVAL * 10) / 1000 // in seconds
export const TON_CACHE_TTL = (TON_BLOCK_TRACKING_INTERVAL * 10) / 1000 // in seconds

export const QUEUE_HIGH_PRIORITY = 1
export const QUEUE_MEDIUM_PRIORITY = 2
export const QUEUE_LOW_PRIORITY = 3
