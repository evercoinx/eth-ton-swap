import { DynamicModule, Module } from "@nestjs/common"
import { TON_CONNECTION } from "./constants"
import { TonModuleAsyncOptions, TonModuleOptions } from "./interfaces/ton-module-options.interface"
import { TonService } from "./ton.service"

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
				TonService,
			],
			exports: [TonService],
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
				TonService,
			],
			exports: [TonService],
		}
	}
}
