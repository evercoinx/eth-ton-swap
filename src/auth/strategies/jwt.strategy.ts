import { Injectable } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { PassportStrategy } from "@nestjs/passport"
import { ExtractJwt, Strategy } from "passport-jwt"
import { JwtData } from "../interfaces/jwt-data"
import { PartialUser } from "../interfaces/partial-user"

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
	constructor(configService: ConfigService) {
		super({
			jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
			secretOrKey: configService.get<string>("application.jwtSecret"),
			ignoreExpiration: false,
		})
	}

	async validate(jwtData: JwtData): Promise<PartialUser> {
		return {
			id: jwtData.sub,
			username: jwtData.username,
		}
	}
}
