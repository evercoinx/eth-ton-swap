import { BullModule } from "@nestjs/bull"
import { Logger, Module } from "@nestjs/common"
import { ConfigModule, ConfigService } from "@nestjs/config"
import { TypeOrmModule } from "@nestjs/typeorm"
import Joi from "joi"
import { EthersModule, MAINNET_NETWORK, ROPSTEN_NETWORK } from "nestjs-ethers"
import { utilities as winstonUtilities, WinstonModule } from "nest-winston"
import winston from "winston"
import { AuthModule } from "./auth/auth.module"
import configuration, { Environment } from "./config/configuration"
import { FeesModule } from "./fees/fees.module"
import { SettingsModule } from "./settings/settings.module"
import { SwapsModule } from "./swaps/swaps.module"
import { TokensModule } from "./tokens/tokens.module"
import { WalletsModule } from "./wallets/wallets.module"

const hostValidator = Joi.alternatives()
	.try(Joi.string().ip(), Joi.string().regex(/[a-zA-Z0-9._-]+/))
	.default("127.0.0.1")

@Module({
	imports: [
		ConfigModule.forRoot({
			envFilePath: ".env",
			load: [configuration],
			cache: process.env.NODE_ENV === Environment.Production,
			validationSchema: Joi.object({
				NODE_ENV: Joi.string()
					.valid(Environment.Development, Environment.Test, Environment.Production)
					.default(Environment.Development),
				APP_HOST: hostValidator,
				APP_PORT: Joi.number().port().default(3000),
				APP_JWT_SECRET: Joi.string().required(),
				APP_JWT_EXPIRES_IN: Joi.string().alphanum().default("1h"),
				APP_CACHE_TTL: Joi.number().positive().default(60),
				DB_HOST: hostValidator,
				DB_PORT: Joi.number().port().default(5432),
				DB_USER: Joi.string().alphanum().required(),
				DB_PASS: Joi.string().required(),
				DB_NAME: Joi.string().alphanum().required(),
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
				BRIDGE_FEE_PERCENT: Joi.number().min(0).max(1).required(),
				BRIDGE_MIN_SWAP_AMOUNT: Joi.number().positive().required(),
				BRIDGE_MAX_SWAP_AMOUNT: Joi.number().positive().required(),
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
				const env = config.get("environment")
				return {
					level: env === Environment.Production ? "info" : "debug",
					format: winston.format.combine(
						winston.format.timestamp(),
						winston.format.printf(({ timestamp, level, message, context, stack }) => {
							const output = `${timestamp} [${
								context || stack
							}] ${level} - ${message}`

							if (!stack) {
								return output
							}
							return `${output}${context ? `\n${stack}` : ""}`
						}),
					),
					transports: [new winston.transports.Console()],
				}
			},
		}),
		TypeOrmModule.forRootAsync({
			imports: [ConfigModule],
			inject: [ConfigService],
			useFactory: (configService: ConfigService) => ({
				type: "postgres",
				host: configService.get("database.host"),
				port: configService.get<number>("database.port"),
				username: configService.get("database.username"),
				password: configService.get("database.password"),
				database: configService.get("database.name"),
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
		EthersModule.forRootAsync({
			imports: [ConfigModule],
			inject: [ConfigService],
			useFactory: (config: ConfigService) => {
				const envToNetwork = {
					[Environment.Development]: ROPSTEN_NETWORK,
					[Environment.Test]: ROPSTEN_NETWORK,
					[Environment.Production]: MAINNET_NETWORK,
				}

				return {
					network: envToNetwork[config.get("environment")],
					etherscan: config.get("etherscan.ApiKey"),
					infura: {
						projectId: config.get("infura.projectId"),
						projectSecret: config.get("infura.projectSecret"),
					},
					useDefaultProvider: false,
				}
			},
		}),
		AuthModule,
		FeesModule,
		SettingsModule,
		SwapsModule,
		TokensModule,
		WalletsModule,
	],
})
export class AppModule {}
