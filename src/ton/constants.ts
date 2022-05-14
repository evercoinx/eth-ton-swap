import BigNumber from "bignumber.js"

export const TON_CONNECTION = "TON_CONNECTION"

export const TON_BLOCK_TRACKING_INTERVAL = 4000

export const TONCOIN_DECIMALS = 9
export const JETTON_DECIMALS = 9

export const DEPLOY_WALLET_GAS = new BigNumber(0.01)
export const DEPLOY_JETTON_MINTER_GAS = new BigNumber(0.038)
export const TRANSFER_JETTON_GAS = new BigNumber(0.035)
export const MINT_TRANSFER_GAS = new BigNumber(0.008)
export const MINT_JETTON_GAS = new BigNumber(0.02)
export const BURN_JETTON_GAS = new BigNumber(0.07)
