export const ETH_SOURCE_SWAPS_QUEUE = "eth_source_swaps"
export const TON_SOURCE_SWAPS_QUEUE = "ton_source_swaps"
export const TON_DESTINATION_SWAPS_QUEUE = "ton_destination_swaps"

export const CONFIRM_ETH_SWAP_JOB = "confirm_eth_swap"
export const CONFIRM_ETH_BLOCK_JOB = "confirm_eth_block"
export const CONFIRM_TON_SWAP_JOB = "confirm_ton_swap"
export const TRANSFER_ETH_FEE_JOB = "transfer_eth_fee"
export const TRANSFER_TON_SWAP_JOB = "transfer_ton_swap"
export const TRANSFER_ETH_SWAP_JOB = "transfer_eth_swap"
export const SET_TON_TRANSACTION_HASH = "set_ton_transaction_hash"

export const SWAP_CONFIRMATION_TTL = 30
export const BLOCK_CONFIRMATION_TTL = 15

export const TOTAL_BLOCK_CONFIRMATIONS = 3

export const ETH_BLOCK_TRACKING_INTERVAL = 14000 / 2
export const TON_BLOCK_TRACKING_INTERVAL = 4000 / 2

export const ETH_CACHE_TTL = (ETH_BLOCK_TRACKING_INTERVAL * 5) / 1000 // in seconds
