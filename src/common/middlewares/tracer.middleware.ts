import * as TracerAgent from "@google-cloud/trace-agent"
import { Injectable, NestMiddleware } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { Request, Response, NextFunction } from "express"
import { Environment } from "../enums/environment.enum"

@Injectable()
export class TracerMiddleware implements NestMiddleware {
	private readonly tracer: TracerAgent.PluginTypes.Tracer

	constructor(private readonly configService: ConfigService) {
		const environment = this.configService.get<Environment>("environment")
		const projectId = this.configService.get<string>("googleCloud.projectId")
		const keyFilename = this.configService.get<string>("googleCloud.keyFilename")

		const options: TracerAgent.Config =
			environment === Environment.Development
				? {
						enabled: !!(projectId && keyFilename),
						projectId,
						keyFilename,
				  }
				: { enabled: true }

		this.tracer = TracerAgent.start({
			serviceContext: {
				service: `eth-ton-swap-${environment}`,
				version: "1.0.0",
			},
			enhancedDatabaseReporting: true,
			...options,
		})
	}

	use(req: Request, res: Response, next: NextFunction) {
		this.tracer.runInRootSpan(
			{ name: req.originalUrl, url: req.originalUrl, method: req.method },
			() => next(),
		)
	}
}
