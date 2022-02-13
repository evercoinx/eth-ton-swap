import { Injectable, UnauthorizedException } from "@nestjs/common"
import { PassportStrategy } from "@nestjs/passport"
import { Strategy } from "passport-local"
import { AuthService } from "../auth.service"
import { PartialUser } from "../interfaces/partial-user"

@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy) {
	constructor(private readonly authService: AuthService) {
		super()
	}

	async validate(username: string, password: string): Promise<PartialUser> {
		const user = await this.authService.checkUser(username, password)
		if (!user) {
			throw new UnauthorizedException()
		}
		return user
	}
}
