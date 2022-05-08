import { ArgumentsHost, Catch, ConflictException } from "@nestjs/common"
import { BaseExceptionFilter } from "@nestjs/core"
import { QueryFailedError } from "typeorm"

@Catch(QueryFailedError)
export class DatabaseExceptionFilter extends BaseExceptionFilter {
	public catch(exception: any, host: ArgumentsHost) {
		const detail = exception.detail
		if (typeof detail === "string" && detail.includes("already exists")) {
			const messageStart = `${exception.table.split("_").join(" ")} with`
			const message = exception.detail.replace("Key", messageStart)

			throw new ConflictException(message)
		}

		return super.catch(exception, host)
	}
}
