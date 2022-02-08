import { Module } from "@nestjs/common"
import { ConfigModule, ConfigService } from "@nestjs/config"
import { TypeOrmModule } from "@nestjs/typeorm"
import * as Joi from "joi"
import { SwapsModule } from "./swaps/swaps.module"
import configuration from "./config/configuration"

@Module({
	imports: [
		ConfigModule.forRoot({
			envFilePath: ".env",
			load: [configuration],
			cache: false,
			validationSchema: Joi.object({
				NODE_ENV: Joi.string()
					.valid("development", "production", "test")
					.default("development"),
				APP_PORT: Joi.number().port().default(3000),
				DB_HOST: Joi.string().ip({ version: "ipv4" }).default("127.0.0.1"),
				DB_PORT: Joi.number().port().default(5432),
				DB_USER: Joi.string().trim(true).alphanum().required(),
				DB_PASS: Joi.string().trim(true).required(),
				DB_NAME: Joi.string().trim(true).alphanum().required(),
			}),
			validationOptions: {
				allowUnknown: true,
				abortEarly: true,
			},
		}),
		TypeOrmModule.forRootAsync({
			imports: [ConfigModule],
			useFactory: (configService: ConfigService) => ({
				type: "postgres",
				host: configService.get("database.host"),
				port: configService.get<number>("database.port"),
				username: configService.get("database.username"),
				password: configService.get("database.password"),
				database: configService.get("database.name"),
				entities: [__dirname + "/**/*.entity{.ts,.js}"],
				synchronize: configService.get("environment") !== "production",
			}),
			inject: [ConfigService],
		}),
		SwapsModule,
	],
})
export class AppModule {}
