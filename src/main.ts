import { HttpStatus, Logger, ValidationPipe, VersioningType, VERSION_NEUTRAL } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { NestFactory } from "@nestjs/core"
import { FastifyAdapter, NestFastifyApplication } from "@nestjs/platform-fastify"
import { SwaggerModule, DocumentBuilder } from "@nestjs/swagger"
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

	app.enableCors({
		origin: true,
		methods: ["GET", "POST"],
		preflightContinue: false,
		optionsSuccessStatus: HttpStatus.NO_CONTENT,
	})

	const config = new DocumentBuilder()
		.setTitle("Bridge")
		.setDescription("Bridge API")
		.setVersion("1.0")
		.addTag("bridge")
		.build()
	const document = SwaggerModule.createDocument(app, config)
	SwaggerModule.setup("api", app, document)

	const configService = app.get(ConfigService)
	await app.listen(configService.get<number>("application.port"))
	Logger.log(`Application is running on ${await app.getUrl()}`, "Bootstrap")
}
bootstrap()
