import BigNumber from "bignumber.js"

export const TON_CONNECTION_TOKEN = "TON_CONNECTION_TOKEN"

export const TON_BLOCK_TRACKING_INTERVAL = 4000
export const TON_CACHE_TTL = (TON_BLOCK_TRACKING_INTERVAL * 10) / 1000 // in seconds

export const TONCOIN_DECIMALS = 9
export const JETTON_DECIMALS = 9

export const DEPLOY_WALLET_GAS = new BigNumber(0.01)
export const DEPLOY_JETTON_MINTER_GAS = new BigNumber(0.04)
export const TRANSFER_JETTON_GAS = new BigNumber(0.035)
export const MINT_TRANSFER_GAS = new BigNumber(0.008)
export const MINT_JETTON_GAS = new BigNumber(0.02)
export const BURN_JETTON_GAS = new BigNumber(0.07)
