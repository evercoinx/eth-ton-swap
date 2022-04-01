export class GetWalletDataDto {
	address: string
	balance: string
	accountState: string
	walletType?: string
	seqno?: number
}
