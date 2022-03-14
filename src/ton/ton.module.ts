import { DynamicModule, Module } from "@nestjs/common"
import { TON_MODULE_OPTIONS } from "./constants"
import { TonModuleOptions } from "./interfaces/ton-module-options.interface"
import { TonService } from "./ton.service"

@Module({})
export class TonModule {
	static register(
		options: TonModuleOptions = {
			apiKey: "2261a804ce64c4558f74e86b68b0177cc7d9e3f795e664d3eda664649f20bbc5",
			isTestnet: true,
			workchain: 0,
			walletVersion: "v3R2",
		},
	): DynamicModule {
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
