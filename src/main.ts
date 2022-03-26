import { HttpStatus, Logger, ValidationPipe } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { HttpAdapterHost, NestFactory } from "@nestjs/core"
import { FastifyAdapter, NestFastifyApplication } from "@nestjs/platform-fastify"
import { fastifyHelmet } from "fastify-helmet"
import { AppModule } from "./app.module"
import { QueryExceptionsFilter } from "./common/query-exceptions.filter"
import { WINSTON_MODULE_NEST_PROVIDER } from "nest-winston"

async function bootstrap() {
	Logger.overrideLogger(["error"])
	const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter({}))

	app.useLogger(app.get(WINSTON_MODULE_NEST_PROVIDER))

	app.enableCors({
		origin: "https://tonicswap.com",
		methods: ["GET", "POST", "DELETE"],
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

	const url = await app.getUrl()
	Logger.log(`Server listenting at ${url}`, "Bootstrap")
	Logger.log(`Log level: ${process.env.APP_LOG_LEVEL}`, "Bootstrap")
}
bootstrap()
