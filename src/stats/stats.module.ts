import { Module } from "@nestjs/common"
import { TokensModule } from "src/tokens/tokens.module"
import { WalletsModule } from "src/wallets/wallets.module"
import { StatsController } from "./stats.controller"

@Module({
	imports: [TokensModule, WalletsModule],
	controllers: [StatsController],
	providers: [],
})
export class StatsModule {}
