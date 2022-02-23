import { ArgumentsHost, Catch, ConflictException } from "@nestjs/common"
import { BaseExceptionFilter } from "@nestjs/core"
import { QueryFailedError } from "typeorm"

@Catch(QueryFailedError)
export class QueryExceptionsFilter extends BaseExceptionFilter {
	public catch(exception: any, host: ArgumentsHost) {
		const detail = exception.detail
		if (typeof detail === "string" && detail.includes("already exists")) {
			const messageStart = `${exception.table.split("_").join(" ")} with`
			throw new ConflictException(
				exception.detail.replace(
					"Key",
					messageStart[0].toUpperCase() + messageStart.slice(1),
				),
			)
		}

		return super.catch(exception, host)
	}
}
