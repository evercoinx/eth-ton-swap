import { Injectable } from "@nestjs/common"
import { InjectRepository } from "@nestjs/typeorm"
import { Repository } from "typeorm"
import { CreateUserDto } from "../dto/create-user.dto"
import { User } from "../user.entity"

@Injectable()
export class UsersService {
	constructor(@InjectRepository(User) private readonly userRepository: Repository<User>) {}

	async create(createUserDto: CreateUserDto): Promise<User> {
		const user = new User()
		user.username = createUserDto.username
		user.password = createUserDto.password

		return await this.userRepository.save(user)
	}

	async findOne(username: string): Promise<User | null> {
		return this.userRepository.findOneBy({ username })
	}
}
