import { ExceptionFilter, Catch, ArgumentsHost, HttpException } from "@nestjs/common"
import { Response } from "express"
import { ERROR_INVALID_PARAMETER, ERROR_NO_ERROR, ERROR_TO_STATUS_CODE } from "../constants"

@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
	catch(exception: HttpException, host: ArgumentsHost) {
		const ctx = host.switchToHttp()
		const response = ctx.getResponse<Response>()
		const status = exception.getStatus()
		const errorResponse = exception.getResponse()
		let message =
			typeof errorResponse === "string"
				? errorResponse
				: (errorResponse["message"] as string | undefined)

		if (!message) {
			message = ERROR_NO_ERROR
		} else if (message.startsWith("Validation failed")) {
			message = ERROR_INVALID_PARAMETER
		}

		const statusCode = ERROR_TO_STATUS_CODE[message]
		response.status(status).json({
			statusCode,
			message,
		})
	}
}
