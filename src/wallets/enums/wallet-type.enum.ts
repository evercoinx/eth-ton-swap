export enum WalletType {
	Transferer = "transferer",
	Collector = "collector",
	Minter = "minter",
	Giver = "giver",
}

export function getAllWalletTypes(): WalletType[] {
	return [WalletType.Transferer, WalletType.Collector, WalletType.Minter, WalletType.Giver]
}
