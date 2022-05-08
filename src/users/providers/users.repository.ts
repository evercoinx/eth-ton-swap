import { Injectable } from "@nestjs/common"
import { InjectRepository } from "@nestjs/typeorm"
import { Repository } from "typeorm"
import { CreateUserDto } from "../dto/create-user.dto"
import { User } from "../user.entity"

@Injectable()
export class UsersRepository {
	constructor(@InjectRepository(User) private readonly repository: Repository<User>) {}

	async create(createUserDto: CreateUserDto): Promise<User> {
		const user = new User()
		user.username = createUserDto.username
		user.password = createUserDto.password

		return await this.repository.save(user)
	}

	async findOne(username: string): Promise<User | null> {
		return this.repository.findOneBy({ username })
	}
}
