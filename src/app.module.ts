import { BullModule } from "@nestjs/bull"
import { Module } from "@nestjs/common"
import { ConfigModule, ConfigService } from "@nestjs/config"
import { TypeOrmModule } from "@nestjs/typeorm"
import * as Joi from "joi"
import { EthersModule, MAINNET_NETWORK, ROPSTEN_NETWORK } from "nestjs-ethers"
import { AuthModule } from "./auth/auth.module"
import configuration from "./config/configuration"
import { FeesModule } from "./fees/fees.module"
import { SwapsModule } from "./swaps/swaps.module"
import { TokensModule } from "./tokens/tokens.module"
import { WalletsModule } from "./wallets/wallets.module"

export enum Environment {
	Development = "development",
	Test = "test",
	Production = "production",
}

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
				APP_PORT: Joi.number().port().default(3000),
				APP_JWT_SECRET: Joi.string().required(),
				APP_JWT_EXPIRES_IN: Joi.string().alphanum().default("1h"),
				DB_HOST: Joi.string().ip({ version: "ipv4" }).default("127.0.0.1"),
				DB_PORT: Joi.number().port().default(5432),
				DB_USER: Joi.string().alphanum().required(),
				DB_PASS: Joi.string().required(),
				DB_NAME: Joi.string().alphanum().required(),
				REDIS_HOST: Joi.string().ip({ version: "ipv4" }).default("127.0.0.1"),
				REDIS_PORT: Joi.number().port().default(6379),
				ETHERSCAN_API_KEY: Joi.string().alphanum().required(),
				INFURA_PROJECT_ID: Joi.string().alphanum().required(),
				INFURA_PROJECT_SECRET: Joi.string().alphanum().required(),
				COINMARKETCAP_API_KEY: Joi.string().uuid().required(),
				BRIDGE_FEE_PERCENT: Joi.number().min(0).max(1).required(),
			}),
			validationOptions: {
				allowUnknown: true,
				abortEarly: true,
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
				synchronize: configService.get("environment") !== Environment.Production,
			}),
		}),
		BullModule.forRootAsync({
			imports: [ConfigModule],
			inject: [ConfigService],
			useFactory: (configService: ConfigService) => ({
				redis: {
					host: configService.get("redis.host"),
					port: configService.get<number>("redis.port"),
					keyPrefix: "bridge",
				},
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
		SwapsModule,
		TokensModule,
		WalletsModule,
	],
})
export class AppModule {}
