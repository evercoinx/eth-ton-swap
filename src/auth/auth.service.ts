import { Injectable } from "@nestjs/common"
import { JwtService } from "@nestjs/jwt"
import * as bcrypt from "bcrypt"
import { UsersService } from "src/users/providers/users.service"
import { LoginDto } from "./dto/login.dto"
import { JwtData } from "./interfaces/jwt-data"
import { PartialUser } from "./interfaces/partial-user"

@Injectable()
export class AuthService {
	constructor(
		private readonly jwtService: JwtService,
		private readonly usersService: UsersService,
	) {}

	async checkUser(username: string, password: string): Promise<PartialUser | undefined> {
		const user = await this.usersService.findOne(username)
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
		return {
			accessToken: this.jwtService.sign(jwtData),
		}
	}
}
