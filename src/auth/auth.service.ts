import { Injectable } from "@nestjs/common"
import { JwtService } from "@nestjs/jwt"
import * as bcrypt from "bcrypt"
import { User } from "src/users/user.entity"
import { UsersService } from "src/users/users.service"

@Injectable()
export class AuthService {
	constructor(
		private readonly usersService: UsersService,
		private readonly jwtService: JwtService,
	) {}

	async validateUser(username: string, passwordText: string): Promise<Partial<User>> {
		const user = await this.usersService.findOne(username)

		if (user) {
			const isMatch = await bcrypt.compare(passwordText, user.password)
			if (isMatch) {
				const { password, ...partialUser } = user
				return partialUser
			}
		}
		return null
	}

	async login(user: User) {
		const payload = {
			sub: user.id,
			username: user.username,
		}
		return {
			accessToken: this.jwtService.sign(payload),
		}
	}
}
