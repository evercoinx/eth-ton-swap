import "dotenv/config"
import { NestFactory } from "@nestjs/core"
import { ValidationPipe } from "@nestjs/common"
import { FastifyAdapter, NestFastifyApplication } from "@nestjs/platform-fastify"
import { AppModule } from "./app.module"

async function bootstrap() {
	const app = await NestFactory.create<NestFastifyApplication>(
		AppModule,
		new FastifyAdapter({
			logger: {
				prettyPrint:
					process.env.NODE_ENV === "development"
						? {
								translateTime: "HH:MM:ss Z",
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

	const port = parseInt(process.env.APP_PORT, 10)
	await app.listen(port)
}
bootstrap()
