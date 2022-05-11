import { Injectable } from "@nestjs/common"
import { JwtService } from "@nestjs/jwt"
import bcrypt from "bcrypt"
import { UsersRepository } from "src/users/providers/users.repository"
import { LoginDto } from "../dto/login.dto"
import { JwtData } from "../interfaces/jwt-data"
import { PartialUser } from "../interfaces/partial-user"

@Injectable()
export class AuthService {
	constructor(
		private readonly usersRepository: UsersRepository,
		private readonly jwtService: JwtService,
	) {}

	async checkUser(username: string, password: string): Promise<PartialUser | undefined> {
		const user = await this.usersRepository.findOne({ username })
		if (!user) {
			return
		}

		const isMatch = await bcrypt.compare(password, user.password)
		if (!isMatch) {
			return
		}

		delete user.password
		return user
	}

	async login(user: PartialUser): Promise<LoginDto> {
		const jwtData: Partial<JwtData> = {
			sub: user.id,
			username: user.username,
		}
		const accessToken = this.jwtService.sign(jwtData)

		return { accessToken }
	}
}
