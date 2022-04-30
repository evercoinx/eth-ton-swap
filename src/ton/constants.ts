import BigNumber from "bignumber.js"

export const TON_CONNECTION_TOKEN = "TON_CONNECTION_TOKEN"

export const TON_BLOCK_TRACKING_INTERVAL = 4000

export const TON_CACHE_TTL = (TON_BLOCK_TRACKING_INTERVAL * 10) / 1000 // in seconds

export const TONCOIN_DECIMALS = 9

export const JETTON_DECIMALS = 9

export const JETTON_MINTER_DEPLOY_GAS = new BigNumber(0.038)

export const JETTON_TRANSFER_GAS = new BigNumber(0.035)

export const JETTON_BURN_GAS = new BigNumber(0.07)
