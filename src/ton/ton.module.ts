import { DynamicModule, Module } from "@nestjs/common"
import { TON_MODULE_OPTIONS } from "./constants"
import { TonModuleOptions } from "./interfaces/ton-module-options.interface"
import { TonService } from "./ton.service"

@Module({})
export class TonModule {
	static register(options: TonModuleOptions): DynamicModule {
		return {
			module: TonModule,
			providers: [
				{
					provide: TON_MODULE_OPTIONS,
					useValue: options,
				},
				TonService,
			],
			exports: [TonService],
		}
	}
}
