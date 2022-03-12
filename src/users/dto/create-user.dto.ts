import { IsAlphanumeric, IsAscii } from "class-validator"

export class CreateUserDto {
	@IsAlphanumeric()
	username: string

	@IsAscii()
	password: string
}
