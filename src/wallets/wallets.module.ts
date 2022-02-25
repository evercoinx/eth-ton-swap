import { Module } from "@nestjs/common"
import { TypeOrmModule } from "@nestjs/typeorm"
import { TokensModule } from "src/tokens/tokens.module"
import { TonModule } from "src/ton/ton.module"
import { Wallet } from "./wallet.entity"
import { WalletsController } from "./wallets.controller"
import { WalletsService } from "./wallets.service"

@Module({
	imports: [
		TypeOrmModule.forFeature([Wallet]),
		TokensModule,
		TonModule.register({
			isTestnet: true,
			workchain: 0,
			walletVersion: "v3R2",
		}),
	],
	controllers: [WalletsController],
	providers: [WalletsService],
	exports: [WalletsService],
})
export class WalletsModule {}
