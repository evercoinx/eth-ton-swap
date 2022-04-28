import BigNumber from "bignumber.js"

export const WALLETS_QUEUE = "wallets"

export const TRANSFER_TONCOINS_JOB = "transfer_toncoins"
export const CONFIRM_TRANSFER_JOB = "confirm_transfer"
export const DEPLOY_WALLET_JOB = "deploy_wallet"

export const WALLET_DEPLOYMENT_AMOUNT = new BigNumber(0.01)
export const WALLET_DEPLOYMENT_ATTEMPTS = 30
