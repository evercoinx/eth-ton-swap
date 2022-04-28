import BigNumber from "bignumber.js"

export const TONCOIN_DECIMALS = 9

export const JETTON_DECIMALS = 9

export const TON_CONNECTION_TOKEN = "TON_CONNECTION_TOKEN"

export const TON_BLOCK_TRACKING_INTERVAL = 4000

export const TON_CACHE_TTL = (TON_BLOCK_TRACKING_INTERVAL * 10) / 1000 // in seconds

export const JETTON_MINTER_DEPLOYMENT_AMOUNT = new BigNumber(0.0375)
