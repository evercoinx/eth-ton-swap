import { Injectable } from "@nestjs/common"
import { InjectRepository } from "@nestjs/typeorm"
import { Repository } from "typeorm"
import { CreateUserDto } from "../dto/create-user.dto"
import { FindUser } from "../interfaces/find-user.interface"
import { User } from "../user.entity"

@Injectable()
export class UsersRepository {
	constructor(@InjectRepository(User) private readonly repository: Repository<User>) {}

	async create({ username, password }: CreateUserDto): Promise<User> {
		const user = new User()
		user.username = username
		user.password = password

		return await this.repository.save(user)
	}

	async findOne({ username }: FindUser): Promise<User | null> {
		return this.repository.findOneBy({ username })
	}
}
