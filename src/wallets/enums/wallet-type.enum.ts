export enum WalletType {
	Transfer = "transfer",
	Collector = "collector",
	Minter = "minter",
	Giver = "giver",
}

export function getAllWalletTypes(): WalletType[] {
	return [WalletType.Transfer, WalletType.Collector, WalletType.Minter, WalletType.Giver]
}
