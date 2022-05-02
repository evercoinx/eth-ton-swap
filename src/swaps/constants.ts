export const ETH_SOURCE_SWAPS_QUEUE = "eth_source_swaps"
export const ETH_DESTINATION_SWAPS_QUEUE = "eth_destination_swaps"

export const TON_SOURCE_SWAPS_QUEUE = "ton_source_swaps"
export const TON_DESTINATION_SWAPS_QUEUE = "ton_destination_swaps"

export const CONFIRM_ETH_TRANSFER_JOB = "confirm_eth_transfer"
export const CONFIRM_ETH_BLOCK_JOB = "confirm_eth_block"
export const TRANSFER_ETH_FEE_JOB = "transfer_eth_fee"
export const TRANSFER_ETH_TOKENS_JOB = "transfer_eth_tokens"

export const CONFIRM_TON_TRANSFER_JOB = "confirm_ton_transfer"
export const CONFIRM_TON_BLOCK_JOB = "confirm_ton_block"
export const MINT_TON_JETTONS_JOB = "mint_ton_jettons"
export const BURN_TON_JETTONS_JOB = "burn_ton_jettons"
export const TRANSFER_TON_FEE_JOB = "transfer_ton_fee"
export const GET_TON_MINT_TRANSACTION_JOB = "get_ton_mint_transaction"
export const GET_TON_BURN_TRANSACTION_JOB = "get_ton_burn_transaction"
export const GET_TON_FEE_TRANSACTION_JOB = "get_ton_fee_transaction"

export const SWAP_EXPIRATION_INTERVAL = 20 * 60 * 1000
export const POST_SWAP_EXPIRATION_INTERVAL = SWAP_EXPIRATION_INTERVAL * 2
export const MAX_PENDING_SWAP_COUNT_BY_IP = 5
export const TOTAL_SWAP_CONFIRMATIONS = 5
