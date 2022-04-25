import { ModuleMetadata } from "@nestjs/common"

export interface TonModuleOptions {
	apiKey: string
	blockchainId: "mainnet" | "testnet"
	workchain: number
	walletVersion: string
	jettonContentUri: URL
}

export interface TonModuleAsyncOptions extends Pick<ModuleMetadata, "imports" | "providers"> {
	useFactory: (...args: any[]) => TonModuleOptions | Promise<TonModuleOptions>
	inject?: any[]
}
