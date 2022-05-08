import { HttpException, HttpStatus } from "@nestjs/common"
import { ERROR_MESSAGE_TO_STATUS_CODE } from "src/common/constants"

export class ConflictException extends HttpException {
	constructor(public readonly message: string) {
		const statusCode = ERROR_MESSAGE_TO_STATUS_CODE[message || "No error"]
		super(HttpException.createBody(message, undefined, statusCode), HttpStatus.CONFLICT)
	}
}
