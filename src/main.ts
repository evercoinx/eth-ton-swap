import { HttpStatus, Logger, ValidationPipe, VersioningType, VERSION_NEUTRAL } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { HttpAdapterHost, NestFactory } from "@nestjs/core"
import { FastifyAdapter, NestFastifyApplication } from "@nestjs/platform-fastify"
import { fastifyHelmet } from "fastify-helmet"
import { AppModule } from "./app.module"
import { QueryExceptionsFilter } from "./common/query-exceptions.filter"

async function bootstrap() {
	const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter())

	app.enableVersioning({
		type: VersioningType.HEADER,
		header: "Accept-Version",
		defaultVersion: VERSION_NEUTRAL,
	})

	app.enableCors({
		origin: true,
		methods: ["GET", "POST"],
		preflightContinue: false,
		optionsSuccessStatus: HttpStatus.NO_CONTENT,
	})

	app.useGlobalPipes(
		new ValidationPipe({
			whitelist: true,
			forbidNonWhitelisted: true,
		}),
	)

	const { httpAdapter } = app.get(HttpAdapterHost)
	app.useGlobalFilters(new QueryExceptionsFilter(httpAdapter))

	await app.register(fastifyHelmet)

	const configService = app.get(ConfigService)
	await app.listen(
		configService.get<number>("application.port"),
		configService.get("application.host"),
	)
	Logger.log(`Application is running on ${await app.getUrl()}`, "Bootstrap")
}
bootstrap()
