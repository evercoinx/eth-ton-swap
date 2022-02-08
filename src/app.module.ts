import { Module } from "@nestjs/common"
import { ConfigModule, ConfigService } from "@nestjs/config"
import { TypeOrmModule } from "@nestjs/typeorm"
import configuration from "./config/configuration"

@Module({
	imports: [
		ConfigModule.forRoot({
			envFilePath: ".env",
			load: [configuration],
		}),
		TypeOrmModule.forRootAsync({
			imports: [ConfigModule],
			useFactory: (configService: ConfigService) => ({
				type: "postgres",
				host: configService.get("DB_HOST"),
				port: configService.get<number>("DB_PORT"),
				username: configService.get("DB_USER"),
				password: configService.get("DB_PASS"),
				database: configService.get("DB_NAME"),
				entities: [__dirname + "/**/*.entity{.ts,.js}"],
				synchronize: configService.get("NODE_ENV") !== "production",
			}),
			inject: [ConfigService],
		}),
	],
})
export class AppModule {}
