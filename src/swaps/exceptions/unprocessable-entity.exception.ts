import { HttpException, HttpStatus } from "@nestjs/common"
import { ERROR_TO_STATUS_CODE, ERROR_NO_ERROR } from "src/common/constants"

export class UnprocessableEntityException extends HttpException {
	constructor(public readonly message: string) {
		const statusCode = ERROR_TO_STATUS_CODE[message || ERROR_NO_ERROR]
		super(
			HttpException.createBody(message, undefined, statusCode),
			HttpStatus.UNPROCESSABLE_ENTITY,
		)
	}
}
