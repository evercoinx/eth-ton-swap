export class GetWalletDataDto {
	isWallet: boolean
	address: string
	balance: string
	accountState: string
	walletType?: string
	seqno?: number
}
