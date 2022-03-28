import { DynamicModule, Module } from "@nestjs/common"
import { TON_CONNECTION } from "./constants"
import { TonModuleAsyncOptions, TonModuleOptions } from "./interfaces/ton-module-options.interface"
import { TonBlockchainProvider } from "./ton-blockchain.provider"
import { TonContractProvider } from "./ton-contract.provider"

@Module({})
export class TonModule {
	static register(options: TonModuleOptions): DynamicModule {
		return {
			module: TonModule,
			providers: [
				{
					provide: TON_CONNECTION,
					useValue: options,
				},
				TonBlockchainProvider,
				TonContractProvider,
			],
			exports: [TonBlockchainProvider, TonContractProvider],
		}
	}

	static registerAsync(options: TonModuleAsyncOptions): DynamicModule {
		return {
			module: TonModule,
			imports: [...(options.imports || [])],
			providers: [
				{
					provide: TON_CONNECTION,
					...options,
				},
				TonBlockchainProvider,
				TonContractProvider,
			],
			exports: [TonBlockchainProvider, TonContractProvider],
		}
	}
}
