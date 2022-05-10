import { Injectable } from "@nestjs/common"

@Injectable()
export class StandardHelper {
	sleep(ms: number): Promise<unknown> {
		return new Promise((resolve) => setTimeout(resolve, ms))
	}
}
