import { Controller, Post, Request, UseGuards } from "@nestjs/common"
import { AuthService } from "src/auth/auth.service"
import { LocalAuthGuard } from "src/auth/guards/local-auth.guard"
import { LoginDto } from "./dto/login.dto"

@Controller("auth")
export class AuthController {
	constructor(private readonly authService: AuthService) {}

	@UseGuards(LocalAuthGuard)
	@Post("login")
	async login(@Request() req): Promise<LoginDto> {
		return this.authService.login(req.user)
	}
}
