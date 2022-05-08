import { HttpStatus, Logger, ValidationPipe } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { HttpAdapterHost, NestFactory } from "@nestjs/core"
import { FastifyAdapter, NestFastifyApplication } from "@nestjs/platform-fastify"
import BigNumber from "bignumber.js"
import { fastifyHelmet } from "fastify-helmet"
import { WINSTON_MODULE_NEST_PROVIDER } from "nest-winston"
import { AppModule } from "./app.module"
import { Environment } from "./common/enums/environment.enum"
import { DatabaseExceptionFilter } from "./common/filters/database-exception.filter"

async function bootstrap() {
	Logger.overrideLogger(["error"])
	const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter({}))

	app.useLogger(app.get(WINSTON_MODULE_NEST_PROVIDER))

	app.enableCors({
		origin: process.env.NODE_ENV === Environment.Development ? "*" : "https://usdj.dev",
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
	app.useGlobalFilters(new DatabaseExceptionFilter(httpAdapter))

	await app.register(fastifyHelmet)

	const configService = app.get(ConfigService)
	await app.listen(
		configService.get<number>("application.port"),
		configService.get("application.host"),
	)

	BigNumber.set({
		DECIMAL_PLACES: 18,
		ROUNDING_MODE: BigNumber.ROUND_DOWN,
	})

	const url = await app.getUrl()
	Logger.log(`Server listenting at ${url}`, "Bootstrap")
	Logger.log(`Log level: ${process.env.APP_LOG_LEVEL}`, "Bootstrap")
}
bootstrap()
