import { LoggingWinston } from "@google-cloud/logging-winston"
import { BullModule } from "@nestjs/bull"
import { Module } from "@nestjs/common"
import { ConfigModule, ConfigService } from "@nestjs/config"
import { TypeOrmModule } from "@nestjs/typeorm"
import Joi from "joi"
import { WinstonModule } from "nest-winston"
import winston from "winston"
import TransportStream from "winston-transport"
import { AuthModule } from "./auth/auth.module"
import { Environment, getAllEnvironments } from "./common/enums/environment.enum"
import config from "./config/config"
import { EthereumModule } from "./ethereum/ethereum.module"
import { SettingsModule } from "./settings/settings.module"
import { StatsModule } from "./stats/stats.module"
import { SwapsModule } from "./swaps/swaps.module"
import { TokensModule } from "./tokens/tokens.module"
import { TonModule } from "./ton/ton.module"
import { WalletsModule } from "./wallets/wallets.module"

const hostValidator = Joi.alternatives()
	.try(Joi.string().ip(), Joi.string().regex(/[a-zA-Z0-9._-]+/))
	.default("127.0.0.1")

@Module({
	imports: [
		ConfigModule.forRoot({
			envFilePath: ".env",
			load: [config],
			cache:
				process.env.NODE_ENV === Environment.Staging ||
				process.env.NODE_ENV === Environment.Production,
			validationSchema: Joi.object({
				NODE_ENV: Joi.string()
					.valid(...getAllEnvironments())
					.default(Environment.Development),
				APP_HOST: hostValidator,
				APP_PORT: Joi.number().port().default(3000),
				APP_LOG_LEVEL: Joi.string().valid("debug", "info", "warn", "error").default("info"),
				APP_JWT_SECRET: Joi.string().required(),
				APP_JWT_EXPIRES_IN: Joi.string().alphanum().default("1h"),
				APP_CACHE_TTL: Joi.number().positive().default(60),
				DB_HOST: hostValidator,
				DB_PORT: Joi.number().port().default(5432),
				DB_USER: Joi.string().alphanum().required(),
				DB_PASS: Joi.string().required(),
				DB_NAME: Joi.string().alphanum().required(),
				DB_SECRET: Joi.string().required(),
				REDIS_HOST: hostValidator,
				REDIS_PORT: Joi.number().port().default(6379),
				REDIS_DB: Joi.number().integer().min(0).max(15).default(0),
				REDIS_PASS: Joi.string().allow("").default(""),
				REDIS_KEY_PREFIX: Joi.string().alphanum().allow("").default(""),
				INFURA_PROJECT_ID: Joi.string().alphanum().length(32).required(),
				INFURA_PROJECT_SECRET: Joi.string().alphanum().length(32).required(),
				ETHERSCAN_API_KEY: Joi.string().alphanum().length(34).required(),
				COINMARKETCAP_API_KEY: Joi.string().uuid().required(),
				TONCENTER_API_KEY: Joi.string().alphanum().length(64).required(),
				BRIDGE_JETTON_CONTENT_URI: Joi.string().uri().required(),
				BRIDGE_SWAP_FEE: Joi.number().min(0).max(1).required(),
			}),
			validationOptions: {
				allowUnknown: true,
				abortEarly: true,
			},
		}),
		WinstonModule.forRootAsync({
			imports: [ConfigModule],
			inject: [ConfigService],
			useFactory: (config: ConfigService) => {
				const transports: TransportStream[] = [new winston.transports.Console()]
				const environment = config.get<Environment>("environment")

				if ([Environment.Staging, Environment.Production].includes(environment)) {
					transports.push(
						new LoggingWinston({
							serviceContext: {
								service: `tonic-bridge-api-${environment}`,
								version: "1.0.0",
							},
						}),
					)
				}

				const filterLogs = winston.format((info) => {
					return ["NestApplication", "RouterExplorer", "RoutesResolver"].includes(
						info.context,
					)
						? false
						: info
				})

				const formats: winston.Logform.Format[] = [filterLogs()]
				if (environment === Environment.Development) {
					formats.push(
						winston.format.colorize({
							all: true,
							colors: {
								debug: "gray",
								info: "green",
								warn: "yellow",
								error: "red",
							},
						}),
					)
				}

				formats.push(
					winston.format.timestamp(),
					winston.format.printf(({ timestamp, level, message, context, stack }) => {
						const output = `${timestamp} [${context || stack}] ${level} - ${message}`
						if (!stack) {
							return output
						}
						return `${output}${context ? `\n${stack}` : ""}`
					}),
				)

				return {
					levels: winston.config.npm.levels,
					level: config.get<string>("application.logLevel"),
					transports,
					format: winston.format.combine(...formats),
				}
			},
		}),
		TypeOrmModule.forRootAsync({
			imports: [ConfigModule],
			inject: [ConfigService],
			useFactory: (configService: ConfigService) => ({
				type: "postgres",
				host: configService.get<string>("database.host"),
				port: configService.get<number>("database.port"),
				username: configService.get<string>("database.username"),
				password: configService.get<string>("database.password"),
				database: configService.get<string>("database.name"),
				entities: [__dirname + "/**/*.entity{.ts,.js}"],
				synchronize: false,
			}),
		}),
		BullModule.forRootAsync({
			imports: [ConfigModule],
			inject: [ConfigService],
			useFactory: (configService: ConfigService) => ({
				redis: configService.get("redis"),
			}),
		}),
		AuthModule,
		TokensModule,
		WalletsModule,
		EthereumModule,
		TonModule,
		SettingsModule,
		SwapsModule,
		StatsModule,
	],
})
export class AppModule {}
