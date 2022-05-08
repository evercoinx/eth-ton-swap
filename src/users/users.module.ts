import { Module } from "@nestjs/common"
import { TypeOrmModule } from "@nestjs/typeorm"
import { User } from "./user.entity"
import { UsersRepository } from "./providers/users.repository"

@Module({
	imports: [TypeOrmModule.forFeature([User])],
	providers: [UsersRepository],
	exports: [UsersRepository],
})
export class UsersModule {}
