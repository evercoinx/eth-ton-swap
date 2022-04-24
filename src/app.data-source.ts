import "dotenv/config"
import "reflect-metadata"
import { DataSource } from "typeorm"

export const AppDataSource = new DataSource({
	type: "postgres",
	host: "127.0.0.1",
	port: parseInt(process.env.DB_PORT, 10),
	username: process.env.DB_USER,
	password: process.env.DB_PASS,
	database: process.env.DB_NAME,
	synchronize: false,
	logging: false,
	entities: ["dist/**/*.entity{.ts,.js}"],
	migrations: ["src/migrations/*.ts"],
	migrationsTableName: "migration",
	migrationsRun: true,
})
