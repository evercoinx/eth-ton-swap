import { MigrationInterface, QueryRunner } from "typeorm"

export class users1644767448120 implements MigrationInterface {
	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			// password = 'MiTonic2@22!'
			`INSERT INTO "user" (username, password) VALUES('tonicadmin', '$2b$10$tTfTPwmyWpORZTv0AK6s6e/gVTVexqEj1B2/T3xU1Atz7yRzrnd4m')`,
		)
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`DELETE FROM "user" WHERE username = 'tonicadmin'`)
	}
}
