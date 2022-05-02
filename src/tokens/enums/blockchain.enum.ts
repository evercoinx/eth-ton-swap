export enum Blockchain {
	Ethereum = "ethereum",
	TON = "ton",
}

export function getAllBlockchains(): Blockchain[] {
	return [Blockchain.Ethereum, Blockchain.TON]
}
