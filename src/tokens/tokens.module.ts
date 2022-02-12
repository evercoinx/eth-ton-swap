import { Module } from "@nestjs/common"
import { ConfigModule } from "@nestjs/config"
import { TypeOrmModule } from "@nestjs/typeorm"
import { Token } from "./token.entity"
import { TokensController } from "./tokens.controller"
import { TokensService } from "./tokens.service"

@Module({
	imports: [ConfigModule, TypeOrmModule.forFeature([Token])],
	controllers: [TokensController],
	providers: [TokensService],
})
export class TokensModule {}
