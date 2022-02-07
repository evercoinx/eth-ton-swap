import { NestFactory } from "@nestjs/core"
import {
	FastifyAdapter,
	NestFastifyApplication,
} from "@nestjs/platform-fastify"
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
	await app.listen(3000)
}
bootstrap()
