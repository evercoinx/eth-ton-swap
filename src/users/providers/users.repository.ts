import { Injectable } from "@nestjs/common"
import { InjectRepository } from "@nestjs/typeorm"
import { Repository } from "typeorm"
import { CreateUser } from "../interfaces/create-user.interface"
import { FindUser } from "../interfaces/find-user.interface"
import { User } from "../user.entity"

@Injectable()
export class UsersRepository {
	constructor(@InjectRepository(User) private readonly repository: Repository<User>) {}

	async create({ username, password }: CreateUser): Promise<User> {
		const user = new User()
		user.username = username
		user.password = password

		return await this.repository.save(user)
	}

	async findOne({ username }: FindUser): Promise<User | null> {
		return this.repository.findOneBy({ username })
	}
}
