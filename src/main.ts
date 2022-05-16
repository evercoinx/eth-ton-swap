import { HttpStatus, Logger, ValidationPipe } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { NestFactory } from "@nestjs/core"
import { FastifyAdapter, NestFastifyApplication } from "@nestjs/platform-fastify"
import BigNumber from "bignumber.js"
import { fastifyHelmet } from "@fastify/helmet"
import { WINSTON_MODULE_NEST_PROVIDER } from "nest-winston"
import { AppModule } from "./app.module"
import { Environment } from "./common/enums/environment.enum"

async function bootstrap() {
	Logger.overrideLogger(["error"])
	const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter({}))

	app.useLogger(app.get(WINSTON_MODULE_NEST_PROVIDER))

	const configService = app.get(ConfigService)
	app.enableCors({
		origin:
			configService.get<Environment>("environment") === Environment.Development
				? "*"
				: "https://usdj.dev",
		methods: ["GET", "POST", "DELETE"],
		preflightContinue: false,
		optionsSuccessStatus: HttpStatus.NO_CONTENT,
	})

	app.useGlobalPipes(
		new ValidationPipe({
			whitelist: true,
			forbidNonWhitelisted: true,
			transform: true,
		}),
	)

	await app.register(fastifyHelmet)

	await app.listen(
		configService.get<number>("application.port"),
		configService.get<string>("application.host"),
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
