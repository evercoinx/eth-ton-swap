import { Module } from "@nestjs/common"
import { SwapsModule } from "src/swaps/swaps.module"
import { TokensModule } from "src/tokens/tokens.module"
import { WalletsModule } from "src/wallets/wallets.module"
import { StatsController } from "./stats.controller"

@Module({
	imports: [TokensModule, WalletsModule, SwapsModule],
	controllers: [StatsController],
	providers: [],
})
export class StatsModule {}
