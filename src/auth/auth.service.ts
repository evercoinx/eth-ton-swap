import { Injectable } from "@nestjs/common"
import { JwtService } from "@nestjs/jwt"
import { User } from "src/users/user.entity"
import { UsersService } from "src/users/users.service"

@Injectable()
export class AuthService {
	constructor(
		private readonly usersService: UsersService,
		private readonly jwtService: JwtService,
	) {}

	async validateUser(username: string, pass: string): Promise<any> {
		const user = await this.usersService.findOne(username)
		if (user && user.password === pass) {
			const { password, ...result } = user
			return result
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
