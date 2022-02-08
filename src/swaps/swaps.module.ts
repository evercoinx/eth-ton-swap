import { Module } from "@nestjs/common"
import { TypeOrmModule } from "@nestjs/typeorm"
import { Swap } from "./swap.entity"
import { SwapsController } from "./swaps.controller"
import { SwapsService } from "./swaps.service"

@Module({
	imports: [TypeOrmModule.forFeature([Swap])],
	providers: [SwapsService],
	controllers: [SwapsController],
})
export class SwapsModule {}
