import "dotenv/config"
import { ValidationPipe } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { NestFactory } from "@nestjs/core"
import { FastifyAdapter, NestFastifyApplication } from "@nestjs/platform-fastify"
import { AppModule, Environment } from "./app.module"

async function bootstrap() {
	const app = await NestFactory.create<NestFastifyApplication>(
		AppModule,
		new FastifyAdapter({
			logger: {
				prettyPrint:
					process.env.NODE_ENV === Environment.Development
						? {
								translateTime: "HH:MM:ss",
								ignore: "pid,hostname",
						  }
						: false,
			},
		}),
	)

	app.useGlobalPipes(
		new ValidationPipe({
			whitelist: true,
			forbidNonWhitelisted: true,
		}),
	)

	const configService = app.get(ConfigService)
	await app.listen(configService.get<number>("application.port"))
}
bootstrap()
