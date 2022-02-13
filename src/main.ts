import { Logger, ValidationPipe, VersioningType, VERSION_NEUTRAL } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { NestFactory } from "@nestjs/core"
import { FastifyAdapter, NestFastifyApplication } from "@nestjs/platform-fastify"
import { AppModule } from "./app.module"

async function bootstrap() {
	const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter())

	app.useGlobalPipes(
		new ValidationPipe({
			whitelist: true,
			forbidNonWhitelisted: true,
		}),
	)

	app.enableVersioning({
		type: VersioningType.HEADER,
		header: "Accept-Version",
		defaultVersion: VERSION_NEUTRAL,
	})

	const configService = app.get(ConfigService)
	await app.listen(configService.get<number>("application.port"))
	Logger.log(`Application is running on ${await app.getUrl()}`, "Bootstrap")
}
bootstrap()
