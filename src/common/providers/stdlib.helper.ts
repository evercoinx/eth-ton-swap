import { Injectable } from "@nestjs/common"

@Injectable()
export class StdlibHelper {
	capitalize(str: string) {
		return `${str[0].toUpperCase()}${str.slice(1)}`
	}

	sleep(ms: number): Promise<unknown> {
		return new Promise((resolve) => setTimeout(resolve, ms))
	}
}
